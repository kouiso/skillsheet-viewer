-- W1の読取境界。管理接続で明示適用する。runtimeへの権限付与・切替は別工程。
-- 接続先の同定と復旧確認が済むまで本番へ適用しない。
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- role は cluster 全域・schema は DB 単位。同一 cluster の別 DB（例: e2e 専用
-- DB）へ install すると role だけが既に存在する。その場合だけ
-- PGOPTIONS='-c vars.allow_existing_role=on' で既存 role を再利用する。
-- 既定では従来どおり拒否し、所有者の目視確認を強制する。
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'skillsheet_document_reader') THEN
    CREATE ROLE skillsheet_document_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  ELSIF current_setting('vars.allow_existing_role', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Dedicated reader role already exists; inspect ownership before installation';
  END IF;
END
$$;

-- Neon等で AUTHORIZATION / OWNER TO を通すため、インストーラーへメンバーシップを付与する。
-- runtime へ membership を広げる用途ではない（管理接続限定の前提条件）。
GRANT skillsheet_document_reader TO CURRENT_USER;

CREATE SCHEMA skillsheet_private AUTHORIZATION skillsheet_document_reader;
REVOKE ALL ON SCHEMA skillsheet_private FROM PUBLIC;
CREATE TABLE skillsheet_private.principals (
  login_name name PRIMARY KEY,
  owner_id text NOT NULL CHECK (owner_id <> '')
);
ALTER TABLE skillsheet_private.principals OWNER TO skillsheet_document_reader;
REVOKE ALL ON skillsheet_private.principals FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO skillsheet_document_reader;
GRANT SELECT ON public.skill_sheets, public.blocks TO skillsheet_document_reader;

CREATE FUNCTION skillsheet_private.read_snapshot(p_sheet_id uuid DEFAULT NULL, p_expected_owner text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, skillsheet_private, pg_temp
AS $$
DECLARE
  v_owner text;
  v_result jsonb;
BEGIN
  SELECT p.owner_id INTO v_owner
  FROM skillsheet_private.principals p WHERE p.login_name = SESSION_USER;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'UNMAPPED_PRINCIPAL';
  END IF;
  IF p_expected_owner IS NOT NULL AND p_expected_owner IS DISTINCT FROM v_owner THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'OWNER_MISMATCH';
  END IF;

  -- 既定判定・親・子・版を同じstatement snapshotで取得する。
  WITH owned AS (
    SELECT s.* FROM public.skill_sheets s WHERE s.owner_id = v_owner
  ), counts AS (
    SELECT count(*) AS total, count(*) FILTER (WHERE is_default) AS defaults FROM owned
  ), target AS (
    SELECT s.* FROM owned s
    WHERE (p_sheet_id IS NOT NULL AND s.id = p_sheet_id)
       OR (p_sheet_id IS NULL AND s.is_default)
  ), document AS (
    SELECT jsonb_build_object(
      'sheetId', s.id, 'title', s.title, 'revision', s.revision::text,
      'blocks', coalesce(jsonb_agg(jsonb_build_object(
        'id', b.id, 'type', b.type, 'order', b."order", 'data', b.data
      ) ORDER BY b."order", b.id) FILTER (WHERE b.id IS NOT NULL), '[]'::jsonb)
    ) AS body
    FROM target s LEFT JOIN public.blocks b ON b.sheet_id = s.id
    GROUP BY s.id, s.title, s.revision
  )
  SELECT CASE
    WHEN p_sheet_id IS NULL AND c.total = 0 THEN jsonb_build_object('status', 'EMPTY')
    WHEN p_sheet_id IS NULL AND c.defaults <> 1 THEN jsonb_build_object('status', 'INVALID_STATE')
    WHEN NOT EXISTS (SELECT FROM document) THEN jsonb_build_object('status', 'NOT_FOUND')
    ELSE jsonb_build_object('status', 'OK', 'snapshot', (SELECT body FROM document LIMIT 1))
  END INTO v_result FROM counts c;
  RETURN v_result;
END
$$;

CREATE FUNCTION skillsheet_private.list_sheets(p_expected_owner text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, skillsheet_private, pg_temp
AS $$
DECLARE
  v_owner text;
  v_result jsonb;
BEGIN
  SELECT p.owner_id INTO v_owner
  FROM skillsheet_private.principals p WHERE p.login_name = SESSION_USER;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'UNMAPPED_PRINCIPAL';
  END IF;
  IF p_expected_owner IS NOT NULL AND p_expected_owner IS DISTINCT FROM v_owner THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'OWNER_MISMATCH';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'sheetId', s.id, 'title', s.title, 'isDefault', s.is_default,
    'createdAt', s.created_at, 'updatedAt', s.updated_at
  ) ORDER BY s.created_at, s.id), '[]'::jsonb)
  INTO v_result FROM public.skill_sheets s WHERE s.owner_id = v_owner;
  RETURN v_result;
END
$$;

ALTER FUNCTION skillsheet_private.read_snapshot(uuid, text) OWNER TO skillsheet_document_reader;
ALTER FUNCTION skillsheet_private.list_sheets(text) OWNER TO skillsheet_document_reader;
REVOKE ALL ON FUNCTION skillsheet_private.read_snapshot(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION skillsheet_private.list_sheets(text) FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE skillsheet_document_reader IN SCHEMA skillsheet_private
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
-- membership は install 中の AUTHORIZATION/OWNER TO 用で、残すと pg_dumpall の復元移植性を壊すため剥がす。
REVOKE skillsheet_document_reader FROM CURRENT_USER;
COMMIT;
