-- 新規合成DB専用。実際の履歴境界をruntime初回・再実行後に検証する。
\set runtime_role runtime_proof_history
\set runtime_password synthetic-history-verification-only
\set owner_id runtime-proof-history-owner
\ir install-runtime-role.sql

DO $$
DECLARE signature text;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
  'history_list(uuid,text,integer,text)', 'history_read(uuid,text,text)',
  'history_count_after(uuid,text,text,text)', 'history_restore(uuid,text,text,text)',
  'deleted_document_list(text)', 'restore_deleted_document(uuid,text,text)'
 ] LOOP
  IF NOT has_function_privilege('runtime_proof_history', 'skillsheet_private.' || signature, 'EXECUTE') THEN
   RAISE EXCEPTION 'Initial runtime install omitted history EXECUTE: %', signature;
  END IF;
 END LOOP;
END $$;

-- 既存CIと同じ6関数のgrantを保持し、内部関数・直接ACLだけを除去する。
GRANT EXECUTE ON FUNCTION
 skillsheet_private.history_list(uuid,text,integer,text),
 skillsheet_private.history_read(uuid,text,text),
 skillsheet_private.history_count_after(uuid,text,text,text),
 skillsheet_private.history_restore(uuid,text,text,text),
 skillsheet_private.deleted_document_list(text),
 skillsheet_private.restore_deleted_document(uuid,text,text),
 skillsheet_private.history_owner(text),
 skillsheet_private.capture_document(uuid,text,bigint,text,text),
 skillsheet_private.capture_document_trigger(),
 skillsheet_private.capture_document_blocks()
TO runtime_proof_history;
GRANT ALL ON public.document_versions, public.deleted_documents TO runtime_proof_history;
\ir install-runtime-role.sql

-- 別ownerの実データも履歴・削除台帳から隔離する。
INSERT INTO skillsheet_private.principals(login_name,owner_id) VALUES(SESSION_USER,'runtime-proof-history-other');
DO $$ BEGIN
 IF skillsheet_private.create_sheet('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10','other owner','[]','runtime-proof-history-other')->>'status' IS DISTINCT FROM 'OK'
  OR skillsheet_private.create_sheet('cccccccc-cccc-4ccc-8ccc-cccccccccc10','other deleted','[]','runtime-proof-history-other')->>'status' IS DISTINCT FROM 'OK'
  OR skillsheet_private.delete_sheet('cccccccc-cccc-4ccc-8ccc-cccccccccc10','0','runtime-proof-history-other')->>'status' IS DISTINCT FROM 'OK' THEN
  RAISE EXCEPTION 'Other owner fixture failed';
 END IF;
END $$;

SET SESSION AUTHORIZATION runtime_proof_history;
DO $$
DECLARE signature text; relation text; command text;
BEGIN
 IF SESSION_USER <> 'runtime_proof_history' THEN RAISE EXCEPTION 'Not actual runtime history principal'; END IF;
 IF skillsheet_private.history_list('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10',NULL,20,'runtime-proof-history-owner') IS DISTINCT FROM '[]'::jsonb
  OR skillsheet_private.history_read('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10','0','runtime-proof-history-owner')->>'status' IS DISTINCT FROM 'NOT_FOUND'
  OR skillsheet_private.history_count_after('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10','0','1','runtime-proof-history-owner') IS DISTINCT FROM '"0"'::jsonb
  OR skillsheet_private.history_restore('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10','0','0','runtime-proof-history-owner')->>'status' IS DISTINCT FROM 'NOT_FOUND'
  OR skillsheet_private.deleted_document_list('runtime-proof-history-owner') IS DISTINCT FROM '[]'::jsonb
  OR skillsheet_private.restore_deleted_document('cccccccc-cccc-4ccc-8ccc-cccccccccc10','1','runtime-proof-history-owner')->>'status' IS DISTINCT FROM 'NOT_FOUND' THEN
  RAISE EXCEPTION 'Other owner history or deleted ledger leaked';
 END IF;
 FOREACH signature IN ARRAY ARRAY[
  'history_list(uuid,text,integer,text)', 'history_read(uuid,text,text)',
  'history_count_after(uuid,text,text,text)', 'history_restore(uuid,text,text,text)',
  'deleted_document_list(text)', 'restore_deleted_document(uuid,text,text)'
 ] LOOP
  IF NOT has_function_privilege('skillsheet_private.' || signature, 'EXECUTE') THEN
   RAISE EXCEPTION 'Runtime reinstall omitted history EXECUTE: %', signature;
  END IF;
 END LOOP;
 FOREACH signature IN ARRAY ARRAY[
  'history_owner(text)', 'capture_document(uuid,text,bigint,text,text)',
  'capture_document_trigger()', 'capture_document_blocks()'
 ] LOOP
  IF has_function_privilege('skillsheet_private.' || signature, 'EXECUTE') THEN
   RAISE EXCEPTION 'Internal history EXECUTE survived reinstall: %', signature;
  END IF;
 END LOOP;
 BEGIN
  PERFORM skillsheet_private.history_owner('runtime-proof-history-owner');
  RAISE EXCEPTION 'Internal history owner callable';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM skillsheet_private.capture_document('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','runtime-proof-history-owner',0,'forbidden','save');
  RAISE EXCEPTION 'Internal history capture callable';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 FOREACH relation IN ARRAY ARRAY['document_versions','deleted_documents'] LOOP
  FOREACH command IN ARRAY ARRAY[
   format('SELECT 1 FROM public.%I LIMIT 1',relation),
   format('INSERT INTO public.%I SELECT * FROM public.%I WHERE false',relation,relation),
   format('UPDATE public.%I SET owner_id=owner_id WHERE false',relation),
   format('DELETE FROM public.%I WHERE false',relation)
  ] LOOP
   BEGIN
    EXECUTE command;
    RAISE EXCEPTION 'Direct history table access permitted: %', command;
   EXCEPTION WHEN insufficient_privilege THEN NULL;
   END;
  END LOOP;
 END LOOP;
 FOREACH command IN ARRAY ARRAY[
  $q$SELECT skillsheet_private.history_list('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10',NULL,20,'different-owner')$q$,
  $q$SELECT skillsheet_private.history_read('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','0','different-owner')$q$,
  $q$SELECT skillsheet_private.history_count_after('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','0','1','different-owner')$q$,
  $q$SELECT skillsheet_private.history_restore('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','0','1','different-owner')$q$,
  $q$SELECT skillsheet_private.deleted_document_list('different-owner')$q$,
  $q$SELECT skillsheet_private.restore_deleted_document('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','1','different-owner')$q$
 ] LOOP
  BEGIN
   EXECUTE command;
   RAISE EXCEPTION 'History owner spoof permitted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
 END LOOP;
END $$;

DO $$
DECLARE r jsonb; payload jsonb := '[{"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01","type":"markdown","order":0,"data":{"markdown":"synthetic initial","future":null}}]';
BEGIN
 r:=skillsheet_private.create_sheet('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','synthetic initial',payload,'runtime-proof-history-owner');
 IF r->>'status' IS DISTINCT FROM 'OK' OR r#>>'{snapshot,revision}' IS DISTINCT FROM '0' THEN RAISE EXCEPTION 'History runtime create failed'; END IF;
 IF skillsheet_private.history_read('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','0','runtime-proof-history-owner') IS DISTINCT FROM r THEN RAISE EXCEPTION 'Create history not atomic'; END IF;
 IF jsonb_array_length(skillsheet_private.history_list('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10',NULL,20,'runtime-proof-history-owner')) IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'Initial history missing'; END IF;
END $$;
-- 確定した初期版を後続のtransactionが変更しない。
DO $$
DECLARE r jsonb; initial jsonb;
BEGIN
 initial:=skillsheet_private.history_read('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','0','runtime-proof-history-owner');
 r:=skillsheet_private.replace_sheet('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','0','synthetic replacement','[]','runtime-proof-history-owner');
 IF r#>>'{snapshot,revision}' IS DISTINCT FROM '1' OR skillsheet_private.history_read('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','1','runtime-proof-history-owner') IS DISTINCT FROM r THEN RAISE EXCEPTION 'Replace history not atomic'; END IF;
 IF skillsheet_private.history_read('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','0','runtime-proof-history-owner') IS DISTINCT FROM initial THEN RAISE EXCEPTION 'Committed initial version changed'; END IF;
 IF skillsheet_private.history_count_after('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','0','1','runtime-proof-history-owner') IS DISTINCT FROM '"1"'::jsonb THEN RAISE EXCEPTION 'History count wrong'; END IF;
 r:=skillsheet_private.history_restore('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','0','1','runtime-proof-history-owner');
 IF r#>>'{snapshot,revision}' IS DISTINCT FROM '2' OR r#>'{snapshot,blocks}' IS DISTINCT FROM initial#>'{snapshot,blocks}' THEN RAISE EXCEPTION 'History restore lost raw blocks or CAS revision'; END IF;
 IF skillsheet_private.history_restore('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','1','1','runtime-proof-history-owner')->>'status' IS DISTINCT FROM 'CONFLICT' THEN RAISE EXCEPTION 'Stale history restore accepted'; END IF;
 IF skillsheet_private.read_snapshot('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','runtime-proof-history-owner') IS DISTINCT FROM r THEN RAISE EXCEPTION 'Stale restore changed document'; END IF;
 IF jsonb_array_length(skillsheet_private.history_list('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10',NULL,20,'runtime-proof-history-owner')) IS DISTINCT FROM 3 THEN RAISE EXCEPTION 'Stale restore changed history'; END IF;
END $$;
DO $$
DECLARE r jsonb; deleted jsonb;
BEGIN
 IF skillsheet_private.delete_sheet('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','2','runtime-proof-history-owner')->>'status' IS DISTINCT FROM 'OK' THEN RAISE EXCEPTION 'History runtime delete failed'; END IF;
 deleted:=skillsheet_private.deleted_document_list('runtime-proof-history-owner');
 IF jsonb_array_length(deleted) IS DISTINCT FROM 1 OR deleted#>>'{0,revision}' IS DISTINCT FROM '3' OR deleted#>>'{0,sheetId}' IS DISTINCT FROM 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10' THEN RAISE EXCEPTION 'Deleted history ledger wrong'; END IF;
 IF skillsheet_private.restore_deleted_document('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','2','runtime-proof-history-owner')->>'status' IS DISTINCT FROM 'CONFLICT' THEN RAISE EXCEPTION 'Stale deleted restore accepted'; END IF;
 IF skillsheet_private.deleted_document_list('runtime-proof-history-owner') IS DISTINCT FROM deleted THEN RAISE EXCEPTION 'Stale deleted restore changed ledger'; END IF;
 r:=skillsheet_private.restore_deleted_document('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','3','runtime-proof-history-owner');
 IF r#>>'{snapshot,revision}' IS DISTINCT FROM '4' OR r#>>'{snapshot,title}' IS DISTINCT FROM 'synthetic initial' OR r#>>'{snapshot,blocks,0,data,markdown}' IS DISTINCT FROM 'synthetic initial' THEN RAISE EXCEPTION 'Deleted restore lost owner data or revision'; END IF;
 IF skillsheet_private.deleted_document_list('runtime-proof-history-owner') IS DISTINCT FROM '[]'::jsonb THEN RAISE EXCEPTION 'Restored deletion ledger remains'; END IF;
 IF skillsheet_private.history_read('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','4','runtime-proof-history-owner') IS DISTINCT FROM r THEN RAISE EXCEPTION 'Deleted restore history not atomic'; END IF;
END $$;
RESET SESSION AUTHORIZATION;
