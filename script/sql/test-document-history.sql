-- 新規合成cluster専用。ON_ERROR_STOP必須。raw JSONをstdoutに出さない。
CREATE ROLE history_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE history_other LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
INSERT INTO skillsheet_private.principals VALUES('history_runtime','history-a'),('history_other','history-b');
GRANT USAGE ON SCHEMA skillsheet_private TO history_runtime,history_other;
GRANT EXECUTE ON FUNCTION skillsheet_private.create_sheet(uuid,text,jsonb,text),skillsheet_private.replace_sheet(uuid,text,text,jsonb,text),skillsheet_private.delete_sheet(uuid,text,text),skillsheet_private.read_snapshot(uuid,text),skillsheet_private.history_list(uuid,text,integer,text),skillsheet_private.history_read(uuid,text,text),skillsheet_private.history_count_after(uuid,text,text,text),skillsheet_private.history_restore(uuid,text,text,text),skillsheet_private.deleted_document_list(text),skillsheet_private.restore_deleted_document(uuid,text,text) TO history_runtime,history_other;
SET SESSION AUTHORIZATION history_runtime;
DO $$ DECLARE r jsonb;payload jsonb:='[{"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01","type":"markdown","order":0,"data":{"markdown":"合成初期本文","future":null}},{"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02","type":"unknown-kind","order":1,"data":{"raw":[1,null,"保存"]}}]'; BEGIN
 r:=skillsheet_private.create_sheet('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','合成初期',payload,'history-a');
 IF r->>'status' IS DISTINCT FROM 'OK' THEN RAISE EXCEPTION 'create failed'; END IF;
 IF skillsheet_private.create_sheet('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','合成初期',payload,'history-a') IS DISTINCT FROM r THEN RAISE EXCEPTION 'retry changed create'; END IF;
 IF jsonb_array_length(skillsheet_private.history_list('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10',NULL,20,'history-a')) IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'retry duplicated history'; END IF;
 IF skillsheet_private.history_read('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','0','history-a')#>'{snapshot,blocks}' IS DISTINCT FROM payload THEN RAISE EXCEPTION 'raw lost'; END IF;
 BEGIN PERFORM * FROM public.document_versions;RAISE EXCEPTION 'direct table read permitted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM skillsheet_private.capture_document('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','history-a',0,'x','x');RAISE EXCEPTION 'internal write permitted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
-- commitを跨ぎ、確定版を後続保存が上書きしないことを確認。
DO $$ DECLARE r jsonb;before jsonb;BEGIN
 before:=skillsheet_private.history_read('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','0','history-a');
 r:=skillsheet_private.replace_sheet('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','0','合成変更','[{"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02","type":"markdown","order":0,"data":{"markdown":"変更後"}}]','history-a');
 IF r#>>'{snapshot,revision}' IS DISTINCT FROM '1' OR before IS DISTINCT FROM skillsheet_private.history_read('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','0','history-a') THEN RAISE EXCEPTION 'committed history changed'; END IF;
 IF skillsheet_private.history_read('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','1','history-a') IS DISTINCT FROM r THEN RAISE EXCEPTION 'new history not atomic'; END IF;
 IF skillsheet_private.replace_sheet('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','0','stale','[]','history-a')->>'status' IS DISTINCT FROM 'CONFLICT' THEN RAISE EXCEPTION 'stale accepted'; END IF;
 IF jsonb_array_length(skillsheet_private.history_list('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10',NULL,20,'history-a')) IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'conflict recorded';END IF;
 PERFORM skillsheet_private.create_sheet('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10','other','[{"id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01","type":"markdown","data":{"markdown":"other"}}]','history-a');
 BEGIN PERFORM skillsheet_private.replace_sheet('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','1','must rollback','[{"id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01","type":"markdown","data":{"markdown":"duplicate"}}]','history-a');RAISE EXCEPTION 'constraint not raised';EXCEPTION WHEN unique_violation THEN NULL;END;
 IF skillsheet_private.read_snapshot('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','history-a') IS DISTINCT FROM r OR jsonb_array_length(skillsheet_private.history_list('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10',NULL,20,'history-a')) IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'rollback history leaked';END IF;
END $$;
SET SESSION AUTHORIZATION history_other;
DO $$ BEGIN
 IF skillsheet_private.history_read('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','0','history-b')->>'status' IS DISTINCT FROM 'NOT_FOUND' OR skillsheet_private.history_list('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10',NULL,20,'history-b') IS DISTINCT FROM '[]'::jsonb THEN RAISE EXCEPTION 'cross owner leak'; END IF;
 BEGIN PERFORM skillsheet_private.history_read('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','0','history-a');RAISE EXCEPTION 'owner spoof';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 IF skillsheet_private.history_restore('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','0','1','history-b')->>'status' IS DISTINCT FROM 'NOT_FOUND' THEN RAISE EXCEPTION 'cross owner restore';END IF;
END $$;
SET SESSION AUTHORIZATION history_runtime;
DO $$ DECLARE r jsonb;BEGIN
 r:=skillsheet_private.history_restore('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','0','1','history-a');
 IF r#>>'{snapshot,revision}' IS DISTINCT FROM '2' OR r#>>'{snapshot,title}' IS DISTINCT FROM '合成初期' THEN RAISE EXCEPTION 'restore not new version';END IF;
 IF skillsheet_private.history_restore('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','1','1','history-a')->>'status' IS DISTINCT FROM 'CONFLICT' THEN RAISE EXCEPTION 'stale undo accepted';END IF;
 r:=skillsheet_private.history_restore('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','1','2','history-a');
 IF r#>>'{snapshot,revision}' IS DISTINCT FROM '3' OR r#>>'{snapshot,title}' IS DISTINCT FROM '合成変更' THEN RAISE EXCEPTION 'undo wrong';END IF;
 IF skillsheet_private.delete_sheet('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','3','history-a')->>'status' IS DISTINCT FROM 'OK' THEN RAISE EXCEPTION 'delete failed';END IF;
 IF skillsheet_private.create_sheet('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','old','[]','history-a')->>'status' IS DISTINCT FROM 'NOT_FOUND' THEN RAISE EXCEPTION 'old create revived';END IF;
 IF skillsheet_private.restore_deleted_document('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','3','history-a')->>'status' IS DISTINCT FROM 'CONFLICT' THEN RAISE EXCEPTION 'stale deletion restored';END IF;
 r:=skillsheet_private.restore_deleted_document('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','4','history-a');
 IF r#>>'{snapshot,revision}' IS DISTINCT FROM '5' OR r#>>'{snapshot,title}' IS DISTINCT FROM '合成変更' THEN RAISE EXCEPTION 'deleted restore wrong';END IF;
 IF skillsheet_private.create_sheet('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','old','[]','history-a')->>'status' IS DISTINCT FROM 'NOT_FOUND' THEN RAISE EXCEPTION 'tombstone lost';END IF;
 IF skillsheet_private.deleted_document_list('history-a') IS DISTINCT FROM '[]'::jsonb THEN RAISE EXCEPTION 'deleted list stale';END IF;
END $$;
RESET SESSION AUTHORIZATION;
-- BigInt精度境界を飛び越えても文字列とSQL比較を保つ。
UPDATE public.skill_sheets SET revision=9007199254740993 WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10';
SET SESSION AUTHORIZATION history_runtime;
DO $$ DECLARE r jsonb;BEGIN
 r:=skillsheet_private.history_restore('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','1','9007199254740993','history-a');
 IF r#>>'{snapshot,revision}' IS DISTINCT FROM '9007199254740994' THEN RAISE EXCEPTION 'bigint rounded';END IF;
 IF skillsheet_private.history_count_after('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','5','9007199254740994','history-a') IS DISTINCT FROM '"2"'::jsonb THEN RAISE EXCEPTION 'count treated revision as size';END IF;
END $$;
RESET SESSION AUTHORIZATION;

-- 管理接続の旧直接writerも、版を進めず本文だけ変えると確定履歴を破壊できない。
DO $$BEGIN
 BEGIN
  UPDATE public.blocks SET data='{"markdown":"版なし更新"}'::jsonb WHERE sheet_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10';
  RAISE EXCEPTION 'unversioned writer changed committed revision';
 EXCEPTION WHEN serialization_failure THEN NULL;
 END;
END $$;

-- 削除済みシートの復元でも別ownerへ情報を渡さない。
SET SESSION AUTHORIZATION history_runtime;
DO $$BEGIN
 PERFORM skillsheet_private.create_sheet('cccccccc-cccc-4ccc-8ccc-cccccccccc10','削除復元対象','[{"id":"cccccccc-cccc-4ccc-8ccc-cccccccccc01","type":"markdown","data":{"markdown":"合成"}}]','history-a');
 PERFORM skillsheet_private.delete_sheet('cccccccc-cccc-4ccc-8ccc-cccccccccc10','0','history-a');
END $$;
SET SESSION AUTHORIZATION history_other;
DO $$BEGIN
 IF skillsheet_private.restore_deleted_document('cccccccc-cccc-4ccc-8ccc-cccccccccc10','1','history-b')->>'status' IS DISTINCT FROM 'NOT_FOUND' THEN RAISE EXCEPTION 'deleted cross owner restore';END IF;
 IF skillsheet_private.deleted_document_list('history-b') IS DISTINCT FROM '[]'::jsonb THEN RAISE EXCEPTION 'deleted owner list leaked';END IF;
 BEGIN PERFORM skillsheet_private.restore_deleted_document('cccccccc-cccc-4ccc-8ccc-cccccccccc10','1','history-a');RAISE EXCEPTION 'deleted owner spoof';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
-- 削除後に同じblock IDが別シートで使われても、失敗は全体rollbackとなる。
SET SESSION AUTHORIZATION history_runtime;
DO $$DECLARE before_history jsonb;before_deleted jsonb;BEGIN
 PERFORM skillsheet_private.create_sheet('dddddddd-dddd-4ddd-8ddd-dddddddddd10','衝突対象','[{"id":"cccccccc-cccc-4ccc-8ccc-cccccccccc01","type":"markdown","data":{"markdown":"別の合成本文"}}]','history-a');
 before_history:=skillsheet_private.history_list('cccccccc-cccc-4ccc-8ccc-cccccccccc10',NULL,20,'history-a');
 before_deleted:=skillsheet_private.deleted_document_list('history-a');
 BEGIN PERFORM skillsheet_private.restore_deleted_document('cccccccc-cccc-4ccc-8ccc-cccccccccc10','1','history-a');RAISE EXCEPTION 'deleted collision accepted';EXCEPTION WHEN unique_violation THEN NULL;END;
 IF skillsheet_private.read_snapshot('cccccccc-cccc-4ccc-8ccc-cccccccccc10','history-a')->>'status' IS DISTINCT FROM 'NOT_FOUND' THEN RAISE EXCEPTION 'failed restore created sheet';END IF;
 IF skillsheet_private.history_list('cccccccc-cccc-4ccc-8ccc-cccccccccc10',NULL,20,'history-a') IS DISTINCT FROM before_history OR skillsheet_private.deleted_document_list('history-a') IS DISTINCT FROM before_deleted THEN RAISE EXCEPTION 'failed restore changed history or ledger';END IF;
 IF skillsheet_private.read_snapshot('dddddddd-dddd-4ddd-8ddd-dddddddddd10','history-a')#>>'{snapshot,blocks,0,data,markdown}' IS DISTINCT FROM '別の合成本文' THEN RAISE EXCEPTION 'failed restore changed other block';END IF;
END $$;
RESET SESSION AUTHORIZATION;
