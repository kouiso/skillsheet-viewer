SET application_name = 'create-after-delete';
SET statement_timeout = '10s';
DO $$
DECLARE result jsonb;
BEGIN
 result := skillsheet_private.create_sheet('00000000-0000-4000-8000-000000000081', 'winner', '[]', 'cas-proof');
 IF result->>'status' IS DISTINCT FROM 'NOT_FOUND' THEN RAISE EXCEPTION 'deleted document resurrected'; END IF;
 result := skillsheet_private.read_snapshot(NULL, 'cas-proof');
 IF result->>'status' IS DISTINCT FROM 'EMPTY' THEN RAISE EXCEPTION 'delete must leave owner empty'; END IF;
END $$;
