SET application_name = 'cas-first';
BEGIN;
DO $$
DECLARE result jsonb;
BEGIN
 result := skillsheet_private.replace_sheet('00000000-0000-4000-8000-000000000081', '0', 'winner', '[]', 'cas-proof');
 IF result->>'status' IS DISTINCT FROM 'OK' THEN RAISE EXCEPTION 'first update failed'; END IF;
END $$;
-- runnerが更新ロックと2接続目の待機を観測できるようcommitを遅延する。
SELECT pg_sleep(3);
COMMIT;
