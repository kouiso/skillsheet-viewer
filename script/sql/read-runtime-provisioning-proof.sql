-- 不正な既存runtimeへのinstall失敗が、認可・password・ACLを変えないことを比較する。
SELECT md5(jsonb_build_object(
  'roles', (SELECT jsonb_agg(to_jsonb(r) ORDER BY rolname)
    FROM pg_authid r WHERE rolname LIKE 'runtime_proof_%'),
  'memberships', (SELECT jsonb_agg(to_jsonb(m) ORDER BY roleid, member, grantor)
    FROM pg_auth_members m),
  'role_settings', (SELECT jsonb_agg(to_jsonb(s) ORDER BY setdatabase,setrole)
    FROM pg_db_role_setting s),
  'principals', (SELECT jsonb_agg(to_jsonb(p) ORDER BY login_name)
    FROM skillsheet_private.principals p),
  'schema_acls', (SELECT jsonb_agg(jsonb_build_array(nspname,nspowner,nspacl) ORDER BY nspname)
    FROM pg_namespace WHERE nspname IN ('public','skillsheet_private')),
  'relation_acls', (SELECT jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relowner,c.relacl)
      ORDER BY n.nspname,c.relname)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('public','skillsheet_private')),
  'column_acls', (SELECT jsonb_agg(jsonb_build_array(n.nspname,c.relname,a.attnum,a.attacl)
      ORDER BY n.nspname,c.relname,a.attnum)
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('public','skillsheet_private') AND a.attnum > 0 AND NOT a.attisdropped),
  'function_acls', (SELECT jsonb_agg(jsonb_build_array(p.oid,p.proowner,p.proacl) ORDER BY p.oid)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','skillsheet_private'))
)::text);
