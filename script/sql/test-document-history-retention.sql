-- 新規合成cluster専用。ON_ERROR_STOP必須。raw JSON・sheet_id一覧をstdoutに出さない。
-- 版履歴の保存期限処理（2026-10-14 決定、#564）を合成データだけで検査する。
-- 基準時刻は固定値を渡し、now() には依存しない。
DO $$ BEGIN
 IF NOT EXISTS(
   SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='skillsheet_private' AND p.proname='prune_document_history'
     AND p.proowner=(SELECT oid FROM pg_roles WHERE rolname='skillsheet_document_writer')
     AND p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog, skillsheet_private, pg_temp']
 ) THEN RAISE EXCEPTION 'owner/definer/search_path changed'; END IF;
 IF EXISTS(
   SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   WHERE n.nspname='skillsheet_private' AND p.proname='prune_document_history' AND a.grantee=0 AND a.privilege_type='EXECUTE'
 ) THEN RAISE EXCEPTION 'public function execute'; END IF;
END $$;

-- 合成シートA（生存）・B（100日前に削除）・C（10日前に削除）とその版を直接作る。
-- AのINSERTは履歴triggerが revision=20 の create 版を自動記録する（rev0〜14の手動版と衝突しない）。
-- save版は1版=短いJSONに固定し、bytesは実測値をSQL側で読む。
INSERT INTO public.skill_sheets(id,owner_id,title,revision,is_default)
 VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','retention-a','合成A',20,true);
INSERT INTO public.document_versions(sheet_id,owner_id,revision,title,blocks,action,recorded_at,transaction_id) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','retention-a',0,'A','[]','create','2025-06-01T00:00:00+09:00',1),
 -- 9/05: 日次間引きで rev1 を消し rev2 を残す
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','retention-a',1,'A','[]','save','2026-09-05T09:00:00+09:00',2),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','retention-a',2,'A','[]','save','2026-09-05T20:00:00+09:00',3),
 -- 9/06(JST): UTC基準なら別日でもJST同日なら同じバケット。rev3 を消し rev4(JST 23:30) を残す
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','retention-a',3,'A','[]','save','2026-09-06T09:00:00+09:00',4),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','retention-a',4,'A','[]','save','2026-09-06T14:30:00+00:00',5),
 -- 9/07(JST): UTC 9/06 16:00 は JST 9/07 01:00。別バケットなので残す
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','retention-a',5,'A','[]','save','2026-09-06T16:00:00+00:00',6),
 -- 9/15: ちょうど30日前。全版保持の内側なので両方残す
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','retention-a',6,'A','[]','save','2026-09-15T09:00:00+09:00',7),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','retention-a',7,'A','[]','save','2026-09-15T10:00:00+09:00',8),
 -- 10/01: save rev8 と restore rev9。save はバケット唯一で残す
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','retention-a',8,'A','[]','save','2026-10-01T10:00:00+09:00',9),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','retention-a',9,'A','[]','restore','2026-10-01T11:00:00+09:00',10),
 -- 月次間引き: 2025-08 は rev10 を消し rev11 を残す。2025-09 の rev12 は別月で残す
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','retention-a',10,'A','[]','save','2025-08-10T10:00:00+09:00',11),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','retention-a',11,'A','[]','save','2025-08-20T10:00:00+09:00',12),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','retention-a',12,'A','[]','save','2025-09-01T10:00:00+09:00',13),
 -- 7日縮小用: 10/06（9日前）は full=30 では残す。10/08（ちょうど7日前）は full=7 でも残す
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','retention-a',13,'A','[]','save','2026-10-06T09:00:00+09:00',14),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10','retention-a',14,'A','[]','save','2026-10-08T09:00:00+09:00',15);
INSERT INTO public.document_versions(sheet_id,owner_id,revision,title,blocks,action,recorded_at,transaction_id) VALUES
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10','retention-a',0,'B','[]','create','2026-05-01T00:00:00+09:00',20),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10','retention-a',1,'B','[]','save','2026-06-01T00:00:00+09:00',21),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10','retention-a',2,'B','[]','delete','2026-07-06T00:00:00+09:00',22),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccc10','retention-a',0,'C','[]','create','2026-08-01T00:00:00+09:00',30),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccc10','retention-a',1,'C','[]','save','2026-09-05T09:00:00+09:00',31),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccc10','retention-a',2,'C','[]','save','2026-09-05T20:00:00+09:00',32),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccc10','retention-a',3,'C','[]','delete','2026-10-05T00:00:00+09:00',33);
INSERT INTO public.deleted_documents(sheet_id,owner_id,revision,deleted_at) VALUES
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10','retention-a',2,'2026-07-06T00:00:00+09:00'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccc10','retention-a',3,'2026-10-05T00:00:00+09:00');

DO $$ DECLARE r jsonb;n bigint;BEGIN
 -- dry-run は集計だけで1行も消さない。間引きはAのrev1,rev3,rev10とCのrev1の4版。
 r:=skillsheet_private.prune_document_history('2026-10-15T00:00:00+09:00',30,true);
 IF (r#>>'{thin,versions}')::int IS DISTINCT FROM 4 OR (r#>>'{purge,sheets}')::int IS DISTINCT FROM 1
   OR (r#>>'{purge,versions}')::int IS DISTINCT FROM 3
   OR (r#>>'{dryRun}')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'dry run summary wrong: %',r; END IF;
 SELECT count(*) INTO n FROM public.document_versions;
 -- A16版（手動15 + trigger記録のcreate）+ B3版 + C4版 = 23。dry-runは1行も消さない。
 IF n IS DISTINCT FROM 23 THEN RAISE EXCEPTION 'dry run deleted %',n; END IF;
 -- 全版保持を7日に縮めると10/06のrev13が候補に加わり間引きは5版。
 r:=skillsheet_private.prune_document_history('2026-10-15T00:00:00+09:00',7,true);
 IF (r#>>'{thin,versions}')::int IS DISTINCT FROM 5 OR (r#>>'{fullDays}')::int IS DISTINCT FROM 7
   THEN RAISE EXCEPTION 'full=7 dry run wrong: %',r; END IF;
 -- bytes は0より大きい正の値だけを返し、本文やIDは出さない。
 IF (r#>>'{thin,bytes}')::bigint<=0 OR (r#>>'{purge,bytes}')::bigint<=0 THEN RAISE EXCEPTION 'bytes not reported'; END IF;
END $$;

-- 無効な引数は全体を拒否する。
DO $$ BEGIN
 BEGIN PERFORM skillsheet_private.prune_document_history('2026-10-15T00:00:00+09:00',6,true);
   RAISE EXCEPTION 'full=6 accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM skillsheet_private.prune_document_history('2026-10-15T00:00:00+09:00',31,true);
   RAISE EXCEPTION 'full=31 accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM skillsheet_private.prune_document_history(NULL,30,true);
   RAISE EXCEPTION 'null now accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;

-- apply は dry-run の集計どおりに消し、保護対象は残す。
DO $$ DECLARE r jsonb;n bigint;BEGIN
 r:=skillsheet_private.prune_document_history('2026-10-15T00:00:00+09:00',30,false);
 IF (r#>>'{thin,versions}')::int IS DISTINCT FROM 4 OR (r#>>'{purge,sheets}')::int IS DISTINCT FROM 1
   OR (r#>>'{total,versions}')::int IS DISTINCT FROM 16 THEN RAISE EXCEPTION 'apply summary wrong: %',r; END IF;
 IF EXISTS(SELECT FROM public.document_versions WHERE (sheet_id,revision) IN
   (('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10',1),('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10',3),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10',10),('cccccccc-cccc-4ccc-8ccc-cccccccccc10',1)))
   THEN RAISE EXCEPTION 'thin survivor'; END IF;
 -- 残すべき版: 最後の日次版・全版保持期間内・月の最後・create/restore/delete・最新版・猶予内ledger。
 IF (SELECT count(*) FROM public.document_versions WHERE sheet_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10'
     AND revision IN(0,2,4,5,6,7,8,9,11,12,13,14,20)) IS DISTINCT FROM 13
   THEN RAISE EXCEPTION 'kept versions missing'; END IF;
 -- 100日前削除のシートは履歴ごと消え、ledger 行も消える。
 IF EXISTS(SELECT FROM public.document_versions WHERE sheet_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10')
   OR EXISTS(SELECT FROM public.deleted_documents WHERE sheet_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10')
   THEN RAISE EXCEPTION 'purge incomplete'; END IF;
 -- 10日前削除のシートは ledger と最後の版・delete 版が残る。
 IF (SELECT count(*) FROM public.deleted_documents WHERE sheet_id='cccccccc-cccc-4ccc-8ccc-cccccccccc10') IS DISTINCT FROM 1
   OR (SELECT count(*) FROM public.document_versions WHERE sheet_id='cccccccc-cccc-4ccc-8ccc-cccccccccc10') IS DISTINCT FROM 3
   THEN RAISE EXCEPTION 'grace sheet wrong'; END IF;
END $$;

-- 再実行は冪等。残る版は保護対象だけなので dry-run も0件。
DO $$ DECLARE r jsonb;BEGIN
 r:=skillsheet_private.prune_document_history('2026-10-15T00:00:00+09:00',30,false);
 IF (r#>>'{thin,versions}')::int IS DISTINCT FROM 0 OR (r#>>'{purge,sheets}')::int IS DISTINCT FROM 0
   THEN RAISE EXCEPTION 'not idempotent: %',r; END IF;
END $$;

-- runtime 系 role には EXECUTE を付与しない。直接テーブル書込みも不可。
CREATE ROLE retention_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
GRANT USAGE ON SCHEMA skillsheet_private TO retention_runtime;
SET SESSION AUTHORIZATION retention_runtime;
DO $$ BEGIN
 BEGIN PERFORM skillsheet_private.prune_document_history('2026-10-15T00:00:00+09:00',30,true);
   RAISE EXCEPTION 'runtime execute permitted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN DELETE FROM public.document_versions;
   RAISE EXCEPTION 'direct delete permitted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET SESSION AUTHORIZATION;
