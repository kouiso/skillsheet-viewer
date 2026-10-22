-- 合成データ専用の隔離DBで、読取・書込install後にON_ERROR_STOPで実行する。
BEGIN;
CREATE ROLE skillsheet_write_test_a LOGIN;
CREATE ROLE skillsheet_write_test_b LOGIN;
GRANT USAGE ON SCHEMA skillsheet_private TO skillsheet_write_test_a, skillsheet_write_test_b;
GRANT EXECUTE ON FUNCTION skillsheet_private.read_snapshot(uuid, text), skillsheet_private.list_sheets(text),
  skillsheet_private.create_sheet(uuid, text, jsonb, text), skillsheet_private.replace_sheet(uuid, text, text, jsonb, text),
  skillsheet_private.delete_sheet(uuid, text, text) TO skillsheet_write_test_a, skillsheet_write_test_b;
INSERT INTO skillsheet_private.principals VALUES
  ('skillsheet_write_test_a', 'write-a'), ('skillsheet_write_test_b', 'write-b');

SET SESSION AUTHORIZATION skillsheet_write_test_a;
DO $$
DECLARE
  a uuid := '11111111-1111-4111-8111-111111111111';
  b uuid := '22222222-2222-4222-8222-222222222222';
  payload jsonb := '[{"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","type":"markdown","data":{"markdown":"合成原文","unknown":null}}]';
  r jsonb;
BEGIN
  BEGIN
    PERFORM skillsheet_private.create_sheet(a, 'wrong owner', payload, 'write-b');
    RAISE EXCEPTION 'Expected owner mismatch accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  r := skillsheet_private.create_sheet(a, 'A', payload);
  IF r->>'status' IS DISTINCT FROM 'OK' OR r#>>'{snapshot,revision}' IS DISTINCT FROM '0' THEN
    RAISE EXCEPTION 'Create must return revision zero snapshot';
  END IF;
  IF skillsheet_private.create_sheet(a, 'A', payload) IS DISTINCT FROM r THEN
    RAISE EXCEPTION 'Identical create retry must be no-op';
  END IF;
  IF skillsheet_private.create_sheet(a, 'changed', payload)->>'status' IS DISTINCT FROM 'CONFLICT' THEN
    RAISE EXCEPTION 'Different create retry accepted';
  END IF;
  r := skillsheet_private.replace_sheet(a, '0', 'A1', payload);
  IF r#>>'{snapshot,revision}' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'CAS did not increment'; END IF;
  BEGIN
    PERFORM skillsheet_private.replace_sheet(a, '1', 'wrong owner', payload, 'write-b');
    RAISE EXCEPTION 'Replace expected owner mismatch accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM skillsheet_private.delete_sheet(a, '1', 'write-b');
    RAISE EXCEPTION 'Delete expected owner mismatch accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF skillsheet_private.replace_sheet(a, '0', 'lost edit', payload)->>'status' IS DISTINCT FROM 'CONFLICT'
    OR skillsheet_private.delete_sheet(a, '0')->>'status' IS DISTINCT FROM 'CONFLICT'
    OR skillsheet_private.create_sheet(a, 'A', payload)->>'status' IS DISTINCT FROM 'CONFLICT' THEN
    RAISE EXCEPTION 'Stale writer accepted';
  END IF;
  IF skillsheet_private.create_sheet(b, 'B', '[]')->>'status' IS DISTINCT FROM 'OK' THEN
    RAISE EXCEPTION 'Second sheet create failed';
  END IF;
  -- 親更新後に別sheetのblock ID制約へ衝突。親版と本文を両方rollbackする。
  BEGIN
    PERFORM skillsheet_private.replace_sheet(b, '0', 'must rollback', payload);
    RAISE EXCEPTION 'Child failure not raised';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  r := skillsheet_private.read_snapshot(b);
  IF r#>>'{snapshot,title}' IS DISTINCT FROM 'B' OR r#>>'{snapshot,revision}' IS DISTINCT FROM '0'
    OR r#>'{snapshot,blocks}' IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'Partial parent commit after child failure';
  END IF;
  BEGIN
    PERFORM skillsheet_private.replace_sheet(a, NULL, 'invalid', payload);
    RAISE EXCEPTION 'Missing expected revision accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM skillsheet_private.delete_sheet(a, '-1');
    RAISE EXCEPTION 'Negative expected revision accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  IF skillsheet_private.delete_sheet(a, '1')->>'status' IS DISTINCT FROM 'OK'
    OR skillsheet_private.create_sheet(a, 'A', payload)->>'status' IS DISTINCT FROM 'NOT_FOUND'
    OR skillsheet_private.delete_sheet(a, '1')->>'status' IS DISTINCT FROM 'NOT_FOUND' THEN
    RAISE EXCEPTION 'Deleted ID resurrected or delete retry changed state';
  END IF;
  r := skillsheet_private.read_snapshot();
  IF r#>>'{snapshot,sheetId}' IS DISTINCT FROM b::text OR r#>>'{snapshot,revision}' IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'Default promotion or promoted revision failed';
  END IF;
END
$$;
RESET SESSION AUTHORIZATION;

SET SESSION AUTHORIZATION skillsheet_write_test_b;
DO $$
DECLARE target uuid := '22222222-2222-4222-8222-222222222222';
BEGIN
  IF skillsheet_private.create_sheet(target, 'B', '[]')->>'status' IS DISTINCT FROM 'NOT_FOUND'
    OR skillsheet_private.replace_sheet(target, '1', 'attack', '[]')->>'status' IS DISTINCT FROM 'NOT_FOUND'
    OR skillsheet_private.delete_sheet(target, '1')->>'status' IS DISTINCT FROM 'NOT_FOUND' THEN
    RAISE EXCEPTION 'Cross-owner mutation accepted';
  END IF;
  BEGIN
    INSERT INTO public.skill_sheets (owner_id, title) VALUES ('write-b', 'bypass');
    RAISE EXCEPTION 'Direct DML allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;
RESET SESSION AUTHORIZATION;

-- 全列を比較し、拒否時に本文・版・state・墓標が変わらないことを検証する。
-- 合成fixture専用のviewで、runtimeに本体テーブルのSELECT権限は付与しない。
CREATE TEMP VIEW skillsheet_write_test_contents AS
SELECT jsonb_build_object(
  'sheets', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY id), '[]'::jsonb) FROM public.skill_sheets s),
  'blocks', (SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY id), '[]'::jsonb) FROM public.blocks b),
  'state', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY owner_id), '[]'::jsonb) FROM public.skillsheet_state s)
) AS contents;
GRANT SELECT ON skillsheet_write_test_contents TO skillsheet_write_test_a;
CREATE FUNCTION pg_temp.skillsheet_test_malformed_default() RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  target uuid := '22222222-2222-4222-8222-222222222222';
  fresh uuid := '44444444-4444-4444-8444-444444444444';
  payload jsonb := '[{"id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","type":"markdown","data":{"markdown":"不正default検証"},"order":0}]';
  replacement jsonb := '[{"id":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee","type":"markdown","data":{"markdown":"ID指定更新"},"order":0}]';
  before_contents jsonb;
  after_contents jsonb;
  before_target jsonb;
  after_target jsonb;
  r jsonb;
BEGIN
  SELECT contents INTO before_contents FROM pg_temp.skillsheet_write_test_contents;
  IF skillsheet_private.create_sheet(fresh, 'must reject', replacement)
    IS DISTINCT FROM '{"status":"INVALID_STATE"}'::jsonb THEN
    RAISE EXCEPTION 'Malformed default allowed new create';
  END IF;
  IF (SELECT contents FROM pg_temp.skillsheet_write_test_contents) IS DISTINCT FROM before_contents THEN
    RAISE EXCEPTION 'Rejected create changed sheets, blocks, revisions, state or tombstones';
  END IF;
  -- 既存IDへの同一create再送も、不正defaultを成功扱いしない。
  IF skillsheet_private.create_sheet(target, 'B', payload)
    IS DISTINCT FROM '{"status":"INVALID_STATE"}'::jsonb THEN
    RAISE EXCEPTION 'Malformed default allowed identical create retry';
  END IF;
  IF (SELECT contents FROM pg_temp.skillsheet_write_test_contents) IS DISTINCT FROM before_contents THEN
    RAISE EXCEPTION 'Rejected create retry changed persisted contents';
  END IF;
  IF skillsheet_private.delete_sheet(target, '1')
    IS DISTINCT FROM '{"status":"INVALID_STATE"}'::jsonb THEN
    RAISE EXCEPTION 'Malformed default allowed delete';
  END IF;
  IF (SELECT contents FROM pg_temp.skillsheet_write_test_contents) IS DISTINCT FROM before_contents THEN
    RAISE EXCEPTION 'Rejected delete changed sheets, blocks, revisions, state or tombstones';
  END IF;
  -- ID指定replaceはdefaultを変更しない。CAS一致時の本文更新を許可する。
  r := skillsheet_private.replace_sheet(target, '1', 'targeted replacement', replacement);
  IF r->>'status' IS DISTINCT FROM 'OK'
    OR r#>>'{snapshot,sheetId}' IS DISTINCT FROM target::text
    OR r#>>'{snapshot,title}' IS DISTINCT FROM 'targeted replacement'
    OR r#>>'{snapshot,revision}' IS DISTINCT FROM '2'
    OR r#>'{snapshot,blocks}' IS DISTINCT FROM replacement THEN
    RAISE EXCEPTION 'Targeted CAS replace must succeed with malformed default';
  END IF;
  SELECT contents INTO after_contents FROM pg_temp.skillsheet_write_test_contents;
  SELECT value INTO before_target FROM jsonb_array_elements(before_contents->'sheets') WHERE value->>'id' = target::text;
  SELECT value INTO after_target FROM jsonb_array_elements(after_contents->'sheets') WHERE value->>'id' = target::text;
  IF (after_target - ARRAY['title', 'revision', 'updated_at'])
      IS DISTINCT FROM (before_target - ARRAY['title', 'revision', 'updated_at'])
    OR after_contents->'state' IS DISTINCT FROM before_contents->'state'
    OR (SELECT coalesce(jsonb_agg(value ORDER BY value->>'id'), '[]'::jsonb)
        FROM jsonb_array_elements(after_contents->'sheets') WHERE value->>'id' <> target::text)
      IS DISTINCT FROM (SELECT coalesce(jsonb_agg(value ORDER BY value->>'id'), '[]'::jsonb)
        FROM jsonb_array_elements(before_contents->'sheets') WHERE value->>'id' <> target::text)
    OR (SELECT coalesce(jsonb_agg(value ORDER BY value->>'id'), '[]'::jsonb)
        FROM jsonb_array_elements(after_contents->'blocks') WHERE value->>'sheet_id' <> target::text)
      IS DISTINCT FROM (SELECT coalesce(jsonb_agg(value ORDER BY value->>'id'), '[]'::jsonb)
        FROM jsonb_array_elements(before_contents->'blocks') WHERE value->>'sheet_id' <> target::text) THEN
    RAISE EXCEPTION 'Targeted replace changed defaults, unrelated rows, state or tombstones';
  END IF;
  IF skillsheet_private.replace_sheet(target, '1', 'stale replacement', payload)->>'status'
    IS DISTINCT FROM 'CONFLICT' THEN
    RAISE EXCEPTION 'Malformed default bypassed replace CAS';
  END IF;
  IF (SELECT contents FROM pg_temp.skillsheet_write_test_contents) IS DISTINCT FROM after_contents THEN
    RAISE EXCEPTION 'Stale targeted replace changed persisted contents';
  END IF;
END
$$;
SAVEPOINT missing_default;
UPDATE public.skill_sheets SET is_default = false WHERE owner_id = 'write-a';
INSERT INTO public.blocks (id, sheet_id, type, "order", data) VALUES
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '22222222-2222-4222-8222-222222222222', 'markdown', 0,
    '{"markdown":"不正default検証"}');
SET SESSION AUTHORIZATION skillsheet_write_test_a;
SELECT pg_temp.skillsheet_test_malformed_default();
RESET SESSION AUTHORIZATION;
ROLLBACK TO SAVEPOINT missing_default;
RELEASE SAVEPOINT missing_default;

-- 通常は部分unique indexが複数defaultを防ぐ。隔離fixture内だけ制約を外す。
-- savepointへ戻してindexと全データを復元し、後続検証の制約を維持する。
SAVEPOINT multiple_defaults;
DROP INDEX public.skill_sheets_owner_default_unique;
INSERT INTO public.skill_sheets (id, owner_id, title, is_default) VALUES
  ('33333333-3333-4333-8333-333333333333', 'write-a', 'second default', true);
INSERT INTO public.blocks (id, sheet_id, type, "order", data) VALUES
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '22222222-2222-4222-8222-222222222222', 'markdown', 0,
    '{"markdown":"不正default検証"}');
SET SESSION AUTHORIZATION skillsheet_write_test_a;
SELECT pg_temp.skillsheet_test_malformed_default();
RESET SESSION AUTHORIZATION;
ROLLBACK TO SAVEPOINT multiple_defaults;
RELEASE SAVEPOINT multiple_defaults;
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_index WHERE indexrelid = 'public.skill_sheets_owner_default_unique'::regclass
    AND indisunique AND indisvalid AND indpred IS NOT NULL) THEN
    RAISE EXCEPTION 'Default unique index was not restored';
  END IF;
END
$$;

-- legacy state欠落でもdeleteが墓標を作る。2^53を超える版も文字列で一致する。
DELETE FROM public.skillsheet_state WHERE owner_id = 'write-a';
UPDATE public.skill_sheets SET revision = 9007199254740993 WHERE owner_id = 'write-a';
SET SESSION AUTHORIZATION skillsheet_write_test_a;
DO $$
DECLARE target uuid := '22222222-2222-4222-8222-222222222222';
BEGIN
  IF skillsheet_private.read_snapshot(target)#>>'{snapshot,revision}' IS DISTINCT FROM '9007199254740993'
  THEN RAISE EXCEPTION 'Bigint precision lost'; END IF;
  IF skillsheet_private.delete_sheet(target, '9007199254740993')->>'status' IS DISTINCT FROM 'OK'
  THEN RAISE EXCEPTION 'Legacy delete failed'; END IF;
  IF skillsheet_private.create_sheet(target, 'B', '[]')->>'status' IS DISTINCT FROM 'NOT_FOUND'
  THEN RAISE EXCEPTION 'Legacy tombstone missing'; END IF;
  IF skillsheet_private.read_snapshot()->>'status' IS DISTINCT FROM 'EMPTY' THEN
    RAISE EXCEPTION 'Last delete not empty';
  END IF;
END
$$;
RESET SESSION AUTHORIZATION;
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM public.skillsheet_state WHERE owner_id = 'write-a'
    AND '22222222-2222-4222-8222-222222222222'::uuid = ANY(deleted_sheet_ids)) THEN
    RAISE EXCEPTION 'Deletion tombstone missing';
  END IF;
END
$$;

-- delete本体の失敗で、それより前の墓標upsertもrollbackされることを確認する。
DELETE FROM public.skillsheet_state WHERE owner_id = 'write-a';
INSERT INTO public.skill_sheets (id, owner_id, title, is_default) VALUES
  ('55555555-5555-4555-8555-555555555555', 'write-a', 'rollback fixture', true);
CREATE FUNCTION public.skillsheet_test_reject_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'synthetic delete failure'; END
$$;
CREATE TRIGGER skillsheet_test_reject_delete BEFORE DELETE ON public.skill_sheets
  FOR EACH ROW EXECUTE FUNCTION public.skillsheet_test_reject_delete();
SET SESSION AUTHORIZATION skillsheet_write_test_a;
DO $$
BEGIN
  BEGIN
    PERFORM skillsheet_private.delete_sheet('55555555-5555-4555-8555-555555555555', '0');
    RAISE EXCEPTION 'Delete failure not raised';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF skillsheet_private.read_snapshot()->>'status' IS DISTINCT FROM 'OK' THEN
    RAISE EXCEPTION 'Failed delete removed document';
  END IF;
END
$$;
RESET SESSION AUTHORIZATION;
DO $$
BEGIN
  IF EXISTS (SELECT FROM public.skillsheet_state WHERE owner_id = 'write-a') THEN
    RAISE EXCEPTION 'Failed legacy delete committed tombstone';
  END IF;
END
$$;
INSERT INTO public.skillsheet_state (owner_id, initialized_at, deleted_sheet_ids) VALUES
  ('write-a', '2026-01-01T00:00:00Z', ARRAY['66666666-6666-4666-8666-666666666666'::uuid]);
SET SESSION AUTHORIZATION skillsheet_write_test_a;
DO $$
BEGIN
  BEGIN
    PERFORM skillsheet_private.delete_sheet('55555555-5555-4555-8555-555555555555', '0');
    RAISE EXCEPTION 'Delete failure not raised';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END
$$;
RESET SESSION AUTHORIZATION;
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM public.skillsheet_state WHERE owner_id = 'write-a'
    AND initialized_at = '2026-01-01T00:00:00Z'::timestamptz
    AND deleted_sheet_ids = ARRAY['66666666-6666-4666-8666-666666666666'::uuid]) THEN
    RAISE EXCEPTION 'Failed delete changed existing marker or history';
  END IF;
END
$$;
ROLLBACK;
