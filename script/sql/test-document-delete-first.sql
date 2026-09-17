SET application_name = 'delete-first';
BEGIN;
DO $$
DECLARE result jsonb;
BEGIN
 result := skillsheet_private.delete_sheet('00000000-0000-4000-8000-000000000081', '1', 'cas-proof');
 IF result->>'status' IS DISTINCT FROM 'OK' THEN RAISE EXCEPTION 'delete failed'; END IF;
END $$;
SELECT pg_sleep(3);
COMMIT;
