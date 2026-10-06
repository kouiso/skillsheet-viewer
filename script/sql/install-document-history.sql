-- migration 0011 と既存 read/write 境界の後、管理接続で明示適用する。本番自動適用禁止。
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
-- 自分がgrantorである既存membershipだけを退避する。他grantorの設定には触れない。
-- 変更と復元は同一transactionなので、途中失敗でも一時権限はrollbackされる。
CREATE TEMP TABLE document_history_membership_before ON COMMIT DROP AS
 SELECT roleid,admin_option,inherit_option,set_option FROM pg_auth_members
 WHERE member=(SELECT oid FROM pg_roles WHERE rolname=CURRENT_USER)
 AND grantor=(SELECT oid FROM pg_roles WHERE rolname=CURRENT_USER)
 AND roleid IN(SELECT oid FROM pg_roles WHERE rolname IN('skillsheet_document_reader','skillsheet_document_writer'));
CREATE TEMP TABLE document_history_schema_before ON COMMIT DROP AS
 SELECT has_schema_privilege('skillsheet_document_writer','skillsheet_private','CREATE') AS writer_create,
 (SELECT jsonb_agg(to_jsonb(a) ORDER BY grantor,grantee,privilege_type,is_grantable)
  FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
  WHERE n.nspname='skillsheet_private') AS schema_acl;
GRANT skillsheet_document_reader, skillsheet_document_writer TO CURRENT_USER WITH SET TRUE GRANTED BY CURRENT_USER;
GRANT skillsheet_document_reader, skillsheet_document_writer TO CURRENT_USER WITH INHERIT TRUE GRANTED BY CURRENT_USER;
GRANT USAGE, CREATE ON SCHEMA skillsheet_private TO skillsheet_document_writer;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_versions, public.deleted_documents TO skillsheet_document_writer;
REVOKE ALL ON public.document_versions, public.deleted_documents FROM PUBLIC;

-- 同一 transaction 内の block 入替中だけ最新内容に更新する。確定済み版を後から上書きしない。
CREATE FUNCTION skillsheet_private.capture_document(p_id uuid,p_owner text,p_revision bigint,p_title text,p_action text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, skillsheet_private, pg_temp AS $$
DECLARE v_blocks jsonb; v_existing public.document_versions%ROWTYPE;
BEGIN
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'type',type,'order',"order",'data',data) ORDER BY "order",id),'[]'::jsonb)
 INTO v_blocks FROM public.blocks WHERE sheet_id=p_id;
 SELECT * INTO v_existing FROM public.document_versions WHERE sheet_id=p_id AND revision=p_revision;
 IF FOUND AND v_existing.transaction_id<>txid_current() THEN
   IF v_existing.owner_id<>p_owner OR v_existing.title<>p_title OR v_existing.blocks<>v_blocks THEN
     RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='REVISION_NOT_ADVANCED';
   END IF;
   RETURN;
 END IF;
 INSERT INTO public.document_versions(sheet_id,owner_id,revision,title,blocks,action,transaction_id)
 VALUES(p_id,p_owner,p_revision,p_title,v_blocks,p_action,txid_current())
 ON CONFLICT(sheet_id,revision) DO UPDATE SET title=excluded.title,blocks=excluded.blocks;
END $$;

CREATE FUNCTION skillsheet_private.capture_document_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, skillsheet_private, pg_temp AS $$
DECLARE v_sheet public.skill_sheets%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='skill_sheets' THEN
   IF TG_WHEN='BEFORE' THEN
     PERFORM skillsheet_private.capture_document(OLD.id,OLD.owner_id,OLD.revision,OLD.title,'baseline');
     IF TG_OP='DELETE' THEN
       PERFORM skillsheet_private.capture_document(OLD.id,OLD.owner_id,OLD.revision+1,OLD.title,'delete');
       INSERT INTO public.deleted_documents(sheet_id,owner_id,revision) VALUES(OLD.id,OLD.owner_id,OLD.revision+1)
       ON CONFLICT(sheet_id) DO UPDATE SET revision=excluded.revision,deleted_at=now();
     END IF;
     IF TG_OP='DELETE' THEN RETURN OLD; END IF;
     RETURN NEW;
   END IF;
   PERFORM skillsheet_private.capture_document(NEW.id,NEW.owner_id,NEW.revision,NEW.title,CASE WHEN TG_OP='INSERT' THEN 'create' ELSE 'save' END);
   RETURN NEW;
 END IF;
 SELECT * INTO v_sheet FROM public.skill_sheets WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.sheet_id ELSE NEW.sheet_id END;
 IF FOUND THEN PERFORM skillsheet_private.capture_document(v_sheet.id,v_sheet.owner_id,v_sheet.revision,v_sheet.title,'save'); END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER document_history_before BEFORE UPDATE OR DELETE ON public.skill_sheets FOR EACH ROW EXECUTE FUNCTION skillsheet_private.capture_document_trigger();
CREATE TRIGGER document_history_after AFTER INSERT OR UPDATE ON public.skill_sheets FOR EACH ROW EXECUTE FUNCTION skillsheet_private.capture_document_trigger();
-- 全ブロック入替で各行ごと全文を再集計しない。transition tableから影響シート単位で記録する。
CREATE FUNCTION skillsheet_private.capture_document_blocks() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, skillsheet_private, pg_temp AS $$
DECLARE s public.skill_sheets%ROWTYPE;
BEGIN
 FOR s IN SELECT * FROM public.skill_sheets WHERE id IN(SELECT DISTINCT sheet_id FROM history_changed) LOOP
   PERFORM skillsheet_private.capture_document(s.id,s.owner_id,s.revision,s.title,'save');
 END LOOP;
 RETURN NULL;
END $$;
CREATE TRIGGER document_history_blocks_insert AFTER INSERT ON public.blocks REFERENCING NEW TABLE AS history_changed FOR EACH STATEMENT EXECUTE FUNCTION skillsheet_private.capture_document_blocks();
CREATE TRIGGER document_history_blocks_delete AFTER DELETE ON public.blocks REFERENCING OLD TABLE AS history_changed FOR EACH STATEMENT EXECUTE FUNCTION skillsheet_private.capture_document_blocks();
CREATE TRIGGER document_history_blocks_update AFTER UPDATE ON public.blocks REFERENCING NEW TABLE AS history_changed FOR EACH STATEMENT EXECUTE FUNCTION skillsheet_private.capture_document_blocks();

CREATE FUNCTION skillsheet_private.history_owner(p_expected_owner text) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, skillsheet_private, pg_temp AS $$
DECLARE v_owner text;
BEGIN
 SELECT owner_id INTO v_owner FROM skillsheet_private.principals WHERE login_name=SESSION_USER;
 IF v_owner IS NULL OR p_expected_owner IS DISTINCT FROM v_owner THEN
 RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='OWNER_MISMATCH'; END IF;
 RETURN v_owner;
END $$;

CREATE FUNCTION skillsheet_private.history_list(p_id uuid,p_before text,p_limit integer,p_owner text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, skillsheet_private, pg_temp AS $$
DECLARE v_owner text;v_result jsonb;
BEGIN
 v_owner:=skillsheet_private.history_owner(p_owner);
 IF p_limit<1 OR p_limit>20 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_LIMIT'; END IF;
 IF p_before IS NOT NULL AND p_before !~ '^(0|[1-9][0-9]*)$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_REVISION'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('revision',revision::text,'title',title,'recordedAt',recorded_at,'action',action,'restoredFrom',restored_from::text,'restoredBefore',restored_before::text) ORDER BY revision DESC),'[]'::jsonb)
 INTO v_result FROM (SELECT * FROM public.document_versions WHERE sheet_id=p_id AND owner_id=v_owner AND (p_before IS NULL OR revision<p_before::bigint) ORDER BY revision DESC LIMIT p_limit) v;
 RETURN v_result;
END $$;

CREATE FUNCTION skillsheet_private.history_read(p_id uuid,p_revision text,p_owner text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, skillsheet_private, pg_temp AS $$
DECLARE v_owner text;v_result jsonb;
BEGIN
 v_owner:=skillsheet_private.history_owner(p_owner);
 IF p_revision IS NULL OR p_revision !~ '^(0|[1-9][0-9]*)$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_REVISION'; END IF;
 SELECT jsonb_build_object('status','OK','snapshot',jsonb_build_object('sheetId',sheet_id,'title',title,'revision',revision::text,'blocks',blocks)) INTO v_result
 FROM public.document_versions WHERE sheet_id=p_id AND revision=p_revision::bigint AND owner_id=v_owner;
 RETURN coalesce(v_result,jsonb_build_object('status','NOT_FOUND'));
END $$;

CREATE FUNCTION skillsheet_private.history_count_after(p_id uuid,p_target text,p_current text,p_owner text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, skillsheet_private, pg_temp AS $$
DECLARE v_owner text;v_count bigint;
BEGIN
 v_owner:=skillsheet_private.history_owner(p_owner);
 SELECT count(*) INTO v_count FROM public.document_versions WHERE sheet_id=p_id AND owner_id=v_owner AND revision>p_target::bigint AND revision<=p_current::bigint;
 RETURN to_jsonb(v_count::text);
END $$;

CREATE FUNCTION skillsheet_private.history_restore(p_id uuid,p_target text,p_expected text,p_owner text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, skillsheet_private, pg_temp AS $$
DECLARE v_owner text;v_current public.skill_sheets%ROWTYPE;v_target public.document_versions%ROWTYPE;v_result jsonb;
BEGIN
 v_owner:=skillsheet_private.history_owner(p_owner);
 IF p_target IS NULL OR p_expected IS NULL OR p_target !~ '^(0|[1-9][0-9]*)$' OR p_expected !~ '^(0|[1-9][0-9]*)$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_REVISION'; END IF;
 SELECT * INTO v_current FROM public.skill_sheets WHERE id=p_id AND owner_id=v_owner FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','NOT_FOUND'); END IF;
 IF v_current.revision<>p_expected::bigint THEN RETURN jsonb_build_object('status','CONFLICT'); END IF;
 SELECT * INTO v_target FROM public.document_versions WHERE sheet_id=p_id AND owner_id=v_owner AND revision=p_target::bigint;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','NOT_FOUND'); END IF;
 v_result:=skillsheet_private.replace_sheet(p_id,p_expected,v_target.title,v_target.blocks,p_owner);
 IF v_result->>'status'='OK' THEN
   UPDATE public.document_versions SET action='restore',restored_from=v_target.revision,restored_before=v_current.revision
   WHERE sheet_id=p_id AND revision=(v_result#>>'{snapshot,revision}')::bigint AND owner_id=v_owner AND transaction_id=txid_current();
 END IF;
 RETURN v_result;
END $$;

CREATE FUNCTION skillsheet_private.deleted_document_list(p_owner text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, skillsheet_private, pg_temp AS $$
DECLARE v_owner text;v_result jsonb;
BEGIN
 v_owner:=skillsheet_private.history_owner(p_owner);
 SELECT coalesce(jsonb_agg(jsonb_build_object('sheetId',d.sheet_id,'revision',d.revision::text,'title',v.title,'deletedAt',d.deleted_at) ORDER BY d.deleted_at DESC,d.sheet_id),'[]'::jsonb)
 INTO v_result FROM public.deleted_documents d JOIN public.document_versions v ON v.sheet_id=d.sheet_id AND v.revision=d.revision AND v.owner_id=d.owner_id WHERE d.owner_id=v_owner;
 RETURN v_result;
END $$;

CREATE FUNCTION skillsheet_private.restore_deleted_document(p_id uuid,p_expected text,p_owner text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, skillsheet_private, pg_temp AS $$
DECLARE v_owner text;v_deleted public.deleted_documents%ROWTYPE;v_target public.document_versions%ROWTYPE;v_total bigint;v_defaults bigint;v_result jsonb;
BEGIN
 v_owner:=skillsheet_private.history_owner(p_owner);
 IF p_expected IS NULL OR p_expected !~ '^(0|[1-9][0-9]*)$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_REVISION'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(v_owner));
 SELECT * INTO v_deleted FROM public.deleted_documents WHERE sheet_id=p_id AND owner_id=v_owner FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','NOT_FOUND'); END IF;
 IF v_deleted.revision<>p_expected::bigint THEN RETURN jsonb_build_object('status','CONFLICT'); END IF;
 IF EXISTS(SELECT FROM public.skill_sheets WHERE id=p_id) THEN RETURN jsonb_build_object('status','CONFLICT'); END IF;
 SELECT * INTO v_target FROM public.document_versions WHERE sheet_id=p_id AND owner_id=v_owner AND revision=v_deleted.revision;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','NOT_FOUND'); END IF;
 PERFORM skillsheet_private.checked_blocks(v_target.blocks);
 SELECT count(*),count(*) FILTER(WHERE is_default) INTO v_total,v_defaults FROM public.skill_sheets WHERE owner_id=v_owner;
 IF v_total>0 AND v_defaults<>1 THEN RETURN jsonb_build_object('status','INVALID_STATE'); END IF;
 INSERT INTO public.skill_sheets(id,owner_id,title,revision,is_default) VALUES(p_id,v_owner,v_target.title,v_deleted.revision+1,v_total=0);
 INSERT INTO public.blocks(id,sheet_id,type,"order",data) SELECT (b->>'id')::uuid,p_id,b->>'type',(b->>'order')::integer,b->'data' FROM jsonb_array_elements(v_target.blocks) b;
 DELETE FROM public.deleted_documents WHERE sheet_id=p_id AND owner_id=v_owner;
 UPDATE public.document_versions SET action='restore-deleted',restored_from=v_target.revision WHERE sheet_id=p_id AND revision=v_deleted.revision+1;
 RETURN skillsheet_private.read_snapshot(p_id,p_owner);
END $$;

-- 初回導入時点の raw 全文を欠落・型変換なく記録する。個人データを migration 本文へ含めない。
DO $$ DECLARE s public.skill_sheets%ROWTYPE;BEGIN FOR s IN SELECT * FROM public.skill_sheets LOOP
 PERFORM skillsheet_private.capture_document(s.id,s.owner_id,s.revision,s.title,'baseline'); END LOOP;END $$;

ALTER FUNCTION skillsheet_private.capture_document(uuid,text,bigint,text,text) OWNER TO skillsheet_document_writer;
ALTER FUNCTION skillsheet_private.capture_document_blocks() OWNER TO skillsheet_document_writer;
ALTER FUNCTION skillsheet_private.capture_document_trigger() OWNER TO skillsheet_document_writer;
ALTER FUNCTION skillsheet_private.history_owner(text) OWNER TO skillsheet_document_writer;
ALTER FUNCTION skillsheet_private.history_list(uuid,text,integer,text) OWNER TO skillsheet_document_writer;
ALTER FUNCTION skillsheet_private.history_read(uuid,text,text) OWNER TO skillsheet_document_writer;
ALTER FUNCTION skillsheet_private.history_count_after(uuid,text,text,text) OWNER TO skillsheet_document_writer;
ALTER FUNCTION skillsheet_private.history_restore(uuid,text,text,text) OWNER TO skillsheet_document_writer;
ALTER FUNCTION skillsheet_private.deleted_document_list(text) OWNER TO skillsheet_document_writer;
ALTER FUNCTION skillsheet_private.restore_deleted_document(uuid,text,text) OWNER TO skillsheet_document_writer;
-- 今回作成した関数だけを対象にし、既存境界のACLを変更しない。
REVOKE ALL ON FUNCTION
 skillsheet_private.capture_document(uuid,text,bigint,text,text),
 skillsheet_private.capture_document_blocks(),
 skillsheet_private.capture_document_trigger(),
 skillsheet_private.history_owner(text),
 skillsheet_private.history_list(uuid,text,integer,text),
 skillsheet_private.history_read(uuid,text,text),
 skillsheet_private.history_count_after(uuid,text,text,text),
 skillsheet_private.history_restore(uuid,text,text,text),
 skillsheet_private.deleted_document_list(text),
 skillsheet_private.restore_deleted_document(uuid,text,text)
FROM PUBLIC;
DO $$ DECLARE r record; prior record;BEGIN
 IF NOT (SELECT writer_create FROM pg_temp.document_history_schema_before) THEN
   REVOKE CREATE ON SCHEMA skillsheet_private FROM skillsheet_document_writer;
 END IF;
 -- 特殊な継承・他grantorのCREATEなど、元のACLを復元できない条件は全体rollbackする。
 IF (SELECT schema_acl FROM pg_temp.document_history_schema_before) IS DISTINCT FROM
    (SELECT jsonb_agg(to_jsonb(a) ORDER BY grantor,grantee,privilege_type,is_grantable)
     FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
     WHERE n.nspname='skillsheet_private') THEN
   RAISE EXCEPTION 'Document history installer must preserve existing schema ACL';
 END IF;
 FOR r IN SELECT oid,rolname FROM pg_roles WHERE rolname IN('skillsheet_document_reader','skillsheet_document_writer') LOOP
   SELECT * INTO prior FROM pg_temp.document_history_membership_before WHERE roleid=r.oid;
   IF FOUND THEN
     EXECUTE format('GRANT %I TO CURRENT_USER WITH SET %s GRANTED BY CURRENT_USER',r.rolname,CASE WHEN prior.set_option THEN 'TRUE' ELSE 'FALSE' END);
     EXECUTE format('GRANT %I TO CURRENT_USER WITH INHERIT %s GRANTED BY CURRENT_USER',r.rolname,CASE WHEN prior.inherit_option THEN 'TRUE' ELSE 'FALSE' END);
     EXECUTE format('GRANT %I TO CURRENT_USER WITH ADMIN %s GRANTED BY CURRENT_USER',r.rolname,CASE WHEN prior.admin_option THEN 'TRUE' ELSE 'FALSE' END);
   ELSE
     EXECUTE format('REVOKE %I FROM CURRENT_USER GRANTED BY CURRENT_USER',r.rolname);
   END IF;
 END LOOP;
END $$;
-- runtime には既存と同様、明示した6関数のEXECUTEだけを別途付与する。履歴テーブル直読権限は付けない。
COMMIT;
