SET application_name='history-cas-second';
DO $$BEGIN
 IF skillsheet_private.history_restore('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','1','9007199254740994','history-a')->>'status' IS DISTINCT FROM 'CONFLICT' THEN RAISE EXCEPTION 'concurrent restore accepted';END IF;
 IF skillsheet_private.history_read('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','9007199254740996','history-a')->>'status' IS DISTINCT FROM 'NOT_FOUND' THEN RAISE EXCEPTION 'conflict wrote version';END IF;
END $$;
