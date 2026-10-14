-- 版履歴の保存期限処理（2026-10-14 決定、#564）。install-document-history.sql 適用済みの
-- DB へ管理接続で明示適用する。本番自動適用禁止。runtime role へは EXECUTE を付与しない。
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
-- 自分がgrantorである既存membershipだけを退避する。他grantorの設定には触れない。
-- 変更と復元は同一transactionなので、途中失敗でも一時権限はrollbackされる。
CREATE TEMP TABLE document_retention_membership_before ON COMMIT DROP AS
 SELECT roleid,admin_option,inherit_option,set_option FROM pg_auth_members
 WHERE member=(SELECT oid FROM pg_roles WHERE rolname=CURRENT_USER)
 AND grantor=(SELECT oid FROM pg_roles WHERE rolname=CURRENT_USER)
 AND roleid=(SELECT oid FROM pg_roles WHERE rolname='skillsheet_document_writer');
CREATE TEMP TABLE document_retention_schema_before ON COMMIT DROP AS
 SELECT has_schema_privilege('skillsheet_document_writer','skillsheet_private','CREATE') AS writer_create,
 (SELECT jsonb_agg(to_jsonb(a) ORDER BY grantor,grantee,privilege_type,is_grantable)
  FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
  WHERE n.nspname='skillsheet_private') AS schema_acl;
GRANT skillsheet_document_writer TO CURRENT_USER WITH SET TRUE GRANTED BY CURRENT_USER;
GRANT skillsheet_document_writer TO CURRENT_USER WITH INHERIT TRUE GRANTED BY CURRENT_USER;
GRANT USAGE, CREATE ON SCHEMA skillsheet_private TO skillsheet_document_writer;

-- 保存期限の間引き・永久削除を実行する唯一の経路。dry_run=true では削除せず集計だけ返す。
-- 返すのは件数とbytesだけで、版の本文やsheet_idの一覧は出力しない。
CREATE FUNCTION skillsheet_private.prune_document_history(p_now timestamptz,p_full_days integer,p_dry_run boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, skillsheet_private, pg_temp AS $$
DECLARE
 v_purge_sheets uuid[];
 v_thin_versions bigint;v_thin_bytes bigint;
 v_purge_versions bigint;v_purge_bytes bigint;
 v_total_versions bigint;v_total_bytes bigint;
BEGIN
 IF p_now IS NULL OR p_dry_run IS NULL OR p_full_days IS NULL OR p_full_days<7 OR p_full_days>30 THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_RETENTION_ARGUMENT'; END IF;
 -- 同時に2本の保存期限処理が走ると片方の集計がもう片方の削除を跨ぎ、dry-run件数と実削除がずれる。
 PERFORM pg_advisory_xact_lock(hashtext('skillsheet_document_retention'));
 -- 削除猶予90日を過ぎたシートのledgerをロックしてから対象を確定する。ロックしないと、
 -- 実行中に削除復元（ledger行を消す）されたシートの履歴まで永久削除してしまう。
 -- 復元済みで本体が残るシートは対象外にする。create再送の防止は
 -- skillsheet_state.deleted_sheet_idsが担うため、ここでは触れない。
 SELECT coalesce(array_agg(t.sheet_id ORDER BY t.sheet_id),'{}'::uuid[]) INTO v_purge_sheets
 FROM (SELECT d.sheet_id FROM public.deleted_documents d
       WHERE d.deleted_at<p_now-interval '90 days'
         AND NOT EXISTS(SELECT FROM public.skill_sheets s WHERE s.id=d.sheet_id)
       ORDER BY d.sheet_id FOR UPDATE OF d) t;

 DROP TABLE IF EXISTS retention_purge_versions;
 CREATE TEMP TABLE retention_purge_versions ON COMMIT DROP AS
 SELECT v.sheet_id,v.revision,pg_column_size(v) AS bytes
 FROM public.document_versions v WHERE v.sheet_id=ANY(v_purge_sheets);
 SELECT count(*),coalesce(sum(bytes),0)::bigint INTO v_purge_versions,v_purge_bytes FROM retention_purge_versions;

 -- save 以外のaction・各シートの最新版・ledger が指す版は間引かない。
 -- 直近 p_full_days は全版保持、そこから365日前まではJST暦日ごと、
 -- それより前はJST暦月ごとに、そのバケットの最後（recorded_at最大、同時刻ならrevision最大）だけ残す。
 -- 日次と月次は別バケットなので、月の中に新しい日次版があっても月の最後の版は残る。
 DROP TABLE IF EXISTS retention_thin;
 CREATE TEMP TABLE retention_thin ON COMMIT DROP AS
 WITH ranked AS(
  SELECT v.sheet_id,v.revision,pg_column_size(v) AS bytes,
   row_number() OVER(
    PARTITION BY v.sheet_id,
     CASE WHEN v.recorded_at>=p_now-interval '365 days'
          THEN 'd'||to_char(v.recorded_at AT TIME ZONE 'Asia/Tokyo','YYYY-MM-DD')
          ELSE 'm'||to_char(v.recorded_at AT TIME ZONE 'Asia/Tokyo','YYYY-MM') END
    ORDER BY v.recorded_at DESC,v.revision DESC
   ) AS bucket_rank
  FROM public.document_versions v
  WHERE v.action='save'
    AND v.recorded_at<p_now-make_interval(days=>p_full_days)
    AND NOT(v.sheet_id=ANY(v_purge_sheets))
 ),latest AS(SELECT sheet_id,max(revision) AS max_revision FROM public.document_versions GROUP BY sheet_id)
 SELECT r.sheet_id,r.revision,r.bytes FROM ranked r
 WHERE r.bucket_rank>1
   AND NOT EXISTS(SELECT FROM public.deleted_documents d WHERE d.sheet_id=r.sheet_id AND d.revision=r.revision)
   AND NOT EXISTS(SELECT FROM latest l WHERE l.sheet_id=r.sheet_id AND l.max_revision=r.revision);
 SELECT count(*),coalesce(sum(bytes),0)::bigint INTO v_thin_versions,v_thin_bytes FROM retention_thin;

 IF NOT p_dry_run THEN
   DELETE FROM public.document_versions v USING retention_thin t WHERE v.sheet_id=t.sheet_id AND v.revision=t.revision;
   DELETE FROM public.document_versions v USING retention_purge_versions t WHERE v.sheet_id=t.sheet_id AND v.revision=t.revision;
   DELETE FROM public.deleted_documents d WHERE d.sheet_id=ANY(v_purge_sheets);
 END IF;
 SELECT count(*),coalesce(sum(pg_column_size(v)),0)::bigint INTO v_total_versions,v_total_bytes FROM public.document_versions v;
 RETURN jsonb_build_object(
   'dryRun',p_dry_run,
   'fullDays',p_full_days,
   'thin',jsonb_build_object('versions',v_thin_versions,'bytes',v_thin_bytes),
   'purge',jsonb_build_object('sheets',cardinality(v_purge_sheets),'versions',v_purge_versions,'bytes',v_purge_bytes),
   'total',jsonb_build_object('versions',v_total_versions,'bytes',v_total_bytes));
END $$;

ALTER FUNCTION skillsheet_private.prune_document_history(timestamptz,integer,boolean) OWNER TO skillsheet_document_writer;
-- 今回作成した関数だけを対象にし、既存境界のACLを変更しない。runtime role への付与は行わない。
REVOKE ALL ON FUNCTION skillsheet_private.prune_document_history(timestamptz,integer,boolean) FROM PUBLIC;
DO $$ DECLARE r record; prior record;BEGIN
 IF NOT (SELECT writer_create FROM pg_temp.document_retention_schema_before) THEN
   REVOKE CREATE ON SCHEMA skillsheet_private FROM skillsheet_document_writer;
 END IF;
 -- 特殊な継承・他grantorのCREATEなど、元のACLを復元できない条件は全体rollbackする。
 IF (SELECT schema_acl FROM pg_temp.document_retention_schema_before) IS DISTINCT FROM
    (SELECT jsonb_agg(to_jsonb(a) ORDER BY grantor,grantee,privilege_type,is_grantable)
     FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
     WHERE n.nspname='skillsheet_private') THEN
   RAISE EXCEPTION 'Document retention installer must preserve existing schema ACL';
 END IF;
 FOR r IN SELECT oid,rolname FROM pg_roles WHERE rolname='skillsheet_document_writer' LOOP
   SELECT * INTO prior FROM pg_temp.document_retention_membership_before WHERE roleid=r.oid;
   IF FOUND THEN
     EXECUTE format('GRANT %I TO CURRENT_USER WITH SET %s GRANTED BY CURRENT_USER',r.rolname,CASE WHEN prior.set_option THEN 'TRUE' ELSE 'FALSE' END);
     EXECUTE format('GRANT %I TO CURRENT_USER WITH INHERIT %s GRANTED BY CURRENT_USER',r.rolname,CASE WHEN prior.inherit_option THEN 'TRUE' ELSE 'FALSE' END);
     EXECUTE format('GRANT %I TO CURRENT_USER WITH ADMIN %s GRANTED BY CURRENT_USER',r.rolname,CASE WHEN prior.admin_option THEN 'TRUE' ELSE 'FALSE' END);
   ELSE
     EXECUTE format('REVOKE %I FROM CURRENT_USER GRANTED BY CURRENT_USER',r.rolname);
   END IF;
 END LOOP;
END $$;
COMMIT;
