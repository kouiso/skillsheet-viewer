-- 読取境界の後に、同定済みの隔離DBへ管理接続で適用する。
-- runtime権限切替・旧writer停止・backup/backfillは別ゲート。自動本番適用しない。
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
-- これらのカラム・制約は drizzle migration 0010 が正本として発行する（#344）。
-- migration 適用済みの DB へこの install を流しても失敗しないよう冪等にしてある。
ALTER TABLE public.skill_sheets ALTER COLUMN revision TYPE bigint;
ALTER TABLE public.skill_sheets ALTER COLUMN revision SET DEFAULT 0;
DO $$ BEGIN
  ALTER TABLE public.skill_sheets ADD CONSTRAINT skill_sheets_revision_nonnegative CHECK (revision >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE public.skillsheet_state ADD COLUMN IF NOT EXISTS deleted_sheet_ids uuid[] NOT NULL DEFAULT '{}';

-- role は cluster 全域・schema は DB 単位。同一 cluster の別 DB（例: e2e 専用
-- DB）へ install すると role だけが既に存在する。その場合だけ
-- PGOPTIONS='-c vars.allow_existing_role=on' で既存 role を再利用する。
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'skillsheet_document_writer') THEN
    CREATE ROLE skillsheet_document_writer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  ELSIF current_setting('vars.allow_existing_role', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Dedicated writer role already exists; inspect ownership before installation';
  END IF;
END
$$;
-- Neon等で OWNER TO を通すため、インストーラーへメンバーシップを付与する。
GRANT skillsheet_document_writer TO CURRENT_USER;
-- reader所有の read_snapshot/principals への GRANT を通すため、reader membership も必要。
GRANT skillsheet_document_reader TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO skillsheet_document_writer;
GRANT USAGE, CREATE ON SCHEMA skillsheet_private TO skillsheet_document_writer;
GRANT SELECT ON skillsheet_private.principals TO skillsheet_document_writer;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.skill_sheets, public.blocks, public.skillsheet_state
  TO skillsheet_document_writer;
GRANT EXECUTE ON FUNCTION skillsheet_private.read_snapshot(uuid, text) TO skillsheet_document_writer;

-- 内部検査のみ。runtimeからのEXECUTEは付与しない。
CREATE FUNCTION skillsheet_private.checked_blocks(p_blocks jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog, skillsheet_private, pg_temp
AS $$
DECLARE v_result jsonb;
BEGIN
  IF p_blocks IS NULL OR jsonb_typeof(p_blocks) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_BLOCKS';
  END IF;
  IF EXISTS (
    SELECT FROM jsonb_array_elements(p_blocks) b
    WHERE jsonb_typeof(b) <> 'object' OR jsonb_typeof(b->'id') IS DISTINCT FROM 'string'
      OR jsonb_typeof(b->'type') IS DISTINCT FROM 'string' OR b->>'type' = ''
      OR NOT (b ? 'data')
      OR EXISTS (SELECT FROM jsonb_object_keys(b) k WHERE k NOT IN ('id', 'type', 'data', 'order'))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_BLOCKS';
  END IF;
  IF EXISTS (
    SELECT FROM jsonb_array_elements(p_blocks) WITH ORDINALITY AS item(b, n)
    WHERE b ? 'order' AND b->'order' IS DISTINCT FROM to_jsonb(n - 1)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_BLOCK_ORDER';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', (b->>'id')::uuid, 'type', b->>'type', 'data', b->'data', 'order', n - 1
  ) ORDER BY n), '[]'::jsonb) INTO v_result
  FROM jsonb_array_elements(p_blocks) WITH ORDINALITY AS item(b, n);
  IF (SELECT count(*) FROM jsonb_array_elements(v_result)) <>
     (SELECT count(DISTINCT b->>'id') FROM jsonb_array_elements(v_result) b) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'DUPLICATE_BLOCK_ID';
  END IF;
  RETURN v_result;
END
$$;

CREATE FUNCTION skillsheet_private.replace_sheet(p_sheet_id uuid, p_expected_revision text, p_title text, p_blocks jsonb, p_expected_owner text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, skillsheet_private, pg_temp
AS $$
DECLARE v_owner text; v_revision bigint; v_blocks jsonb;
BEGIN
  SELECT owner_id INTO v_owner FROM skillsheet_private.principals WHERE login_name = SESSION_USER;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'UNMAPPED_PRINCIPAL';
  END IF;
  IF p_expected_owner IS NOT NULL AND p_expected_owner IS DISTINCT FROM v_owner THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'OWNER_MISMATCH';
  END IF;
  IF p_sheet_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision !~ '^(0|[1-9][0-9]*)$'
    OR p_title IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_REQUEST';
  END IF;
  v_revision := p_expected_revision::bigint;
  v_blocks := skillsheet_private.checked_blocks(p_blocks);
  UPDATE public.skill_sheets SET title = p_title, revision = revision + 1, updated_at = now()
    WHERE id = p_sheet_id AND owner_id = v_owner AND revision = v_revision;
  IF NOT FOUND THEN
    IF EXISTS (SELECT FROM public.skill_sheets WHERE id = p_sheet_id AND owner_id = v_owner) THEN
      RETURN jsonb_build_object('status', 'CONFLICT');
    END IF;
    RETURN jsonb_build_object('status', 'NOT_FOUND');
  END IF;
  DELETE FROM public.blocks WHERE sheet_id = p_sheet_id;
  INSERT INTO public.blocks (id, sheet_id, type, "order", data)
    SELECT (b->>'id')::uuid, p_sheet_id, b->>'type', (b->>'order')::integer, b->'data'
    FROM jsonb_array_elements(v_blocks) b;
  RETURN skillsheet_private.read_snapshot(p_sheet_id);
END
$$;

CREATE FUNCTION skillsheet_private.create_sheet(p_sheet_id uuid, p_title text, p_blocks jsonb, p_expected_owner text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, skillsheet_private, pg_temp
AS $$
DECLARE v_owner text; v_existing public.skill_sheets%ROWTYPE; v_blocks jsonb;
  v_current jsonb; v_total bigint; v_defaults bigint; v_inserted uuid;
BEGIN
  SELECT owner_id INTO v_owner FROM skillsheet_private.principals WHERE login_name = SESSION_USER;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'UNMAPPED_PRINCIPAL';
  END IF;
  IF p_expected_owner IS NOT NULL AND p_expected_owner IS DISTINCT FROM v_owner THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'OWNER_MISMATCH';
  END IF;
  IF p_sheet_id IS NULL OR p_title IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_REQUEST';
  END IF;
  v_blocks := skillsheet_private.checked_blocks(p_blocks);
  PERFORM pg_advisory_xact_lock(hashtext(v_owner));
  IF EXISTS (SELECT FROM public.skillsheet_state WHERE owner_id = v_owner AND p_sheet_id = ANY(deleted_sheet_ids)) THEN
    RETURN jsonb_build_object('status', 'NOT_FOUND');
  END IF;
  SELECT * INTO v_existing FROM public.skill_sheets WHERE id = p_sheet_id AND owner_id = v_owner FOR UPDATE;
  IF NOT FOUND AND EXISTS (SELECT FROM public.skill_sheets WHERE id = p_sheet_id) THEN
    RETURN jsonb_build_object('status', 'NOT_FOUND');
  END IF;
  SELECT count(*), count(*) FILTER (WHERE is_default) INTO v_total, v_defaults
    FROM public.skill_sheets WHERE owner_id = v_owner;
  IF v_total > 0 AND v_defaults <> 1 THEN
    RETURN jsonb_build_object('status', 'INVALID_STATE');
  END IF;
  IF v_existing.id IS NOT NULL THEN
    v_current := skillsheet_private.read_snapshot(p_sheet_id);
    IF v_existing.title = p_title AND v_current#>'{snapshot,blocks}' = v_blocks THEN
      RETURN v_current;
    END IF;
    RETURN jsonb_build_object('status', 'CONFLICT');
  END IF;
  INSERT INTO public.skill_sheets (id, owner_id, title, is_default)
    VALUES (p_sheet_id, v_owner, p_title, v_total = 0)
    ON CONFLICT (id) DO NOTHING RETURNING id INTO v_inserted;
  IF v_inserted IS NULL THEN
    -- 別ownerが同UUIDを同時作成した場合も存在情報を返さない。
    RETURN jsonb_build_object('status', 'NOT_FOUND');
  END IF;
  INSERT INTO public.skillsheet_state (owner_id) VALUES (v_owner) ON CONFLICT (owner_id) DO NOTHING;
  INSERT INTO public.blocks (id, sheet_id, type, "order", data)
    SELECT (b->>'id')::uuid, p_sheet_id, b->>'type', (b->>'order')::integer, b->'data'
    FROM jsonb_array_elements(v_blocks) b;
  RETURN skillsheet_private.read_snapshot(p_sheet_id);
END
$$;

CREATE FUNCTION skillsheet_private.delete_sheet(p_sheet_id uuid, p_expected_revision text, p_expected_owner text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, skillsheet_private, pg_temp
AS $$
DECLARE v_owner text; v_expected bigint; v_existing public.skill_sheets%ROWTYPE;
  v_total bigint; v_defaults bigint;
BEGIN
  SELECT owner_id INTO v_owner FROM skillsheet_private.principals WHERE login_name = SESSION_USER;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'UNMAPPED_PRINCIPAL';
  END IF;
  IF p_expected_owner IS NOT NULL AND p_expected_owner IS DISTINCT FROM v_owner THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'OWNER_MISMATCH';
  END IF;
  IF p_sheet_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision !~ '^(0|[1-9][0-9]*)$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_REQUEST';
  END IF;
  v_expected := p_expected_revision::bigint;
  PERFORM pg_advisory_xact_lock(hashtext(v_owner));
  SELECT * INTO v_existing FROM public.skill_sheets WHERE id = p_sheet_id AND owner_id = v_owner FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'NOT_FOUND'); END IF;
  IF v_existing.revision <> v_expected THEN RETURN jsonb_build_object('status', 'CONFLICT'); END IF;
  SELECT count(*), count(*) FILTER (WHERE is_default) INTO v_total, v_defaults
    FROM public.skill_sheets WHERE owner_id = v_owner;
  IF v_defaults <> 1 THEN RETURN jsonb_build_object('status', 'INVALID_STATE'); END IF;
  INSERT INTO public.skillsheet_state (owner_id, deleted_sheet_ids) VALUES (v_owner, ARRAY[p_sheet_id])
    ON CONFLICT (owner_id) DO UPDATE SET deleted_sheet_ids =
      array_append(public.skillsheet_state.deleted_sheet_ids, p_sheet_id);
  DELETE FROM public.skill_sheets WHERE id = p_sheet_id AND owner_id = v_owner AND revision = v_expected;
  IF v_existing.is_default THEN
    UPDATE public.skill_sheets SET is_default = true, revision = revision + 1, updated_at = now()
      WHERE id = (SELECT id FROM public.skill_sheets WHERE owner_id = v_owner ORDER BY created_at, id LIMIT 1);
  END IF;
  RETURN jsonb_build_object('status', 'OK');
END
$$;

ALTER FUNCTION skillsheet_private.checked_blocks(jsonb) OWNER TO skillsheet_document_writer;
ALTER FUNCTION skillsheet_private.replace_sheet(uuid, text, text, jsonb, text) OWNER TO skillsheet_document_writer;
ALTER FUNCTION skillsheet_private.create_sheet(uuid, text, jsonb, text) OWNER TO skillsheet_document_writer;
ALTER FUNCTION skillsheet_private.delete_sheet(uuid, text, text) OWNER TO skillsheet_document_writer;
REVOKE ALL ON FUNCTION skillsheet_private.checked_blocks(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION skillsheet_private.replace_sheet(uuid, text, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION skillsheet_private.create_sheet(uuid, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION skillsheet_private.delete_sheet(uuid, text, text) FROM PUBLIC;
REVOKE CREATE ON SCHEMA skillsheet_private FROM skillsheet_document_writer;
ALTER DEFAULT PRIVILEGES FOR ROLE skillsheet_document_writer IN SCHEMA skillsheet_private
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
-- membership は install 中の OWNER TO / GRANT 用で、残すと pg_dumpall の復元移植性を壊すため剥がす。
REVOKE skillsheet_document_writer FROM CURRENT_USER;
REVOKE skillsheet_document_reader FROM CURRENT_USER;
COMMIT;
