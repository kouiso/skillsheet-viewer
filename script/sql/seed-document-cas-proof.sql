CREATE ROLE cas_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
GRANT USAGE ON SCHEMA skillsheet_private TO cas_runtime;
GRANT EXECUTE ON FUNCTION skillsheet_private.read_snapshot(uuid, text),
 skillsheet_private.replace_sheet(uuid, text, text, jsonb, text),
 skillsheet_private.create_sheet(uuid, text, jsonb, text),
 skillsheet_private.delete_sheet(uuid, text, text) TO cas_runtime;
INSERT INTO skillsheet_private.principals VALUES ('cas_runtime', 'cas-proof');
INSERT INTO public.skill_sheets (id, owner_id, title, is_default)
VALUES ('00000000-0000-4000-8000-000000000081', 'cas-proof', 'before', true);
