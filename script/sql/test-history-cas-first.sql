SET application_name='history-cas-first';
BEGIN;
DO $$BEGIN
 IF skillsheet_private.history_restore('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','1','9007199254740994','history-a')#>>'{snapshot,revision}' IS DISTINCT FROM '9007199254740995' THEN RAISE EXCEPTION 'first restore failed';END IF;
END $$;
SELECT pg_sleep(2);
COMMIT;
