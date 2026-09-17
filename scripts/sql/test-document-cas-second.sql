SET application_name = 'cas-second';
SET statement_timeout = '10s';
DO $$
DECLARE result jsonb;
BEGIN
 result := skillsheet_private.replace_sheet('00000000-0000-4000-8000-000000000081', '0', 'loser', '[]', 'cas-proof');
 IF result->>'status' IS DISTINCT FROM 'CONFLICT' THEN RAISE EXCEPTION 'stale concurrent save did not conflict'; END IF;
 result := skillsheet_private.read_snapshot('00000000-0000-4000-8000-000000000081', 'cas-proof');
 IF result#>>'{snapshot,revision}' IS DISTINCT FROM '1' OR result#>>'{snapshot,title}' IS DISTINCT FROM 'winner'
 THEN RAISE EXCEPTION 'concurrent save overwrote committed winner'; END IF;
END $$;
