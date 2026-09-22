-- 合成データだけの隔離DB用。install-skillsheet-read-boundary.sql適用後に実行する。
-- fixture・role・grantは最後にrollbackする。psql ON_ERROR_STOP必須。
BEGIN;
CREATE ROLE skillsheet_test_a LOGIN;
CREATE ROLE skillsheet_test_b LOGIN;
CREATE ROLE skillsheet_test_unmapped LOGIN;
GRANT USAGE ON SCHEMA skillsheet_private TO skillsheet_test_a, skillsheet_test_b, skillsheet_test_unmapped;
GRANT EXECUTE ON FUNCTION skillsheet_private.read_snapshot(uuid, text), skillsheet_private.list_sheets(text)
  TO skillsheet_test_a, skillsheet_test_b, skillsheet_test_unmapped;
INSERT INTO skillsheet_private.principals VALUES
  ('skillsheet_test_a', 'synthetic-a'), ('skillsheet_test_b', 'synthetic-b');
INSERT INTO public.skill_sheets (id, owner_id, title, is_default) VALUES
  ('11111111-1111-4111-8111-111111111111', 'synthetic-a', 'A', true),
  ('22222222-2222-4222-8222-222222222222', 'synthetic-b', 'B', true);
INSERT INTO public.blocks (sheet_id, type, "order", data) VALUES
  ('11111111-1111-4111-8111-111111111111', 'future-type', 1, '{"unknown":null}'),
  ('11111111-1111-4111-8111-111111111111', 'markdown', 0, '{"markdown":"合成本文"}');

SET SESSION AUTHORIZATION skillsheet_test_a;
DO $$
DECLARE r jsonb;
BEGIN
  r := skillsheet_private.read_snapshot();
  IF r->>'status' IS DISTINCT FROM 'OK' OR r#>>'{snapshot,sheetId}' IS DISTINCT FROM '11111111-1111-4111-8111-111111111111'
    OR jsonb_typeof(r#>'{snapshot,revision}') IS DISTINCT FROM 'string'
    OR r#>>'{snapshot,blocks,0,type}' IS DISTINCT FROM 'markdown'
    OR r#>'{snapshot,blocks,1,data}' IS DISTINCT FROM '{"unknown":null}'::jsonb THEN
    RAISE EXCEPTION 'Snapshot identity, revision or raw ordering lost';
  END IF;
  IF skillsheet_private.read_snapshot('22222222-2222-4222-8222-222222222222') <>
     skillsheet_private.read_snapshot('33333333-3333-4333-8333-333333333333') THEN
    RAISE EXCEPTION 'Other owner differs from missing';
  END IF;
  IF skillsheet_private.read_snapshot('22222222-2222-4222-8222-222222222222')->>'status' IS DISTINCT FROM 'NOT_FOUND'
    OR jsonb_array_length(skillsheet_private.list_sheets()) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Owner boundary failed';
  END IF;
  BEGIN
    PERFORM * FROM public.skill_sheets;
    RAISE EXCEPTION 'Direct sheet SELECT allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.blocks;
    RAISE EXCEPTION 'Direct blocks SELECT allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.skillsheet_state;
    RAISE EXCEPTION 'Direct state SELECT allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE skillsheet_private.principals SET owner_id = 'synthetic-b';
    RAISE EXCEPTION 'Principal mutation allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    EXECUTE 'SET ROLE skillsheet_document_reader';
    RAISE EXCEPTION 'Definer role escalation allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('app.owner_id', 'synthetic-b', true);
  IF skillsheet_private.read_snapshot()#>>'{snapshot,title}' IS DISTINCT FROM 'A' THEN
    RAISE EXCEPTION 'Mutable owner setting trusted';
  END IF;
END
$$;
RESET SESSION AUTHORIZATION;

SET SESSION AUTHORIZATION skillsheet_test_b;
DO $$
BEGIN
  IF skillsheet_private.read_snapshot()#>'{snapshot,blocks}' IS DISTINCT FROM '[]'::jsonb
    OR skillsheet_private.read_snapshot()#>>'{snapshot,title}' IS DISTINCT FROM 'B' THEN
    RAISE EXCEPTION 'Empty block document or second owner failed';
  END IF;
END
$$;
RESET SESSION AUTHORIZATION;

UPDATE public.skill_sheets SET is_default = false WHERE owner_id = 'synthetic-a';
SET SESSION AUTHORIZATION skillsheet_test_a;
DO $$
BEGIN
  IF skillsheet_private.read_snapshot()->>'status' IS DISTINCT FROM 'INVALID_STATE' THEN
    RAISE EXCEPTION 'Missing default was silently repaired';
  END IF;
  IF skillsheet_private.read_snapshot('11111111-1111-4111-8111-111111111111')->>'status' IS DISTINCT FROM 'OK' THEN
    RAISE EXCEPTION 'Explicit document became inaccessible';
  END IF;
END
$$;
RESET SESSION AUTHORIZATION;

DELETE FROM public.skill_sheets WHERE owner_id = 'synthetic-a';
SET SESSION AUTHORIZATION skillsheet_test_a;
DO $$
BEGIN
  IF skillsheet_private.read_snapshot()->>'status' IS DISTINCT FROM 'EMPTY'
    OR skillsheet_private.list_sheets() IS DISTINCT FROM '[]'::jsonb
    OR skillsheet_private.read_snapshot()->>'status' IS DISTINCT FROM 'EMPTY' THEN
    RAISE EXCEPTION 'Empty owner caused implicit initialization';
  END IF;
END
$$;
RESET SESSION AUTHORIZATION;

SET SESSION AUTHORIZATION skillsheet_test_unmapped;
DO $$
BEGIN
  BEGIN
    PERFORM skillsheet_private.read_snapshot();
    RAISE EXCEPTION 'Unmapped snapshot accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM skillsheet_private.list_sheets();
    RAISE EXCEPTION 'Unmapped list accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;
RESET SESSION AUTHORIZATION;
DO $$
BEGIN
  IF EXISTS (SELECT FROM public.skillsheet_state WHERE owner_id IN ('synthetic-a', 'synthetic-b'))
    OR EXISTS (SELECT FROM public.skill_sheets WHERE owner_id = 'synthetic-a') THEN
    RAISE EXCEPTION 'Read mutated persistent state';
  END IF;
  IF EXISTS (
    SELECT FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    WHERE p.pronamespace = 'skillsheet_private'::regnamespace AND a.grantee = 0
      AND a.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'PUBLIC function execution remains';
  END IF;
END
$$;
ROLLBACK;
