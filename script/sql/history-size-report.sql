-- 履歴の容量を読むだけの照会（#574 計測・#577 監視で共用）。本文・titleは読まない。
-- 呼び出し側が READ ONLY transaction で包む。table/TOAST/索引は pg_total_relation_size の内訳として出し、二重に数えない。
SELECT jsonb_build_object(
  'measuredAt', now(),
  'transactionReadOnly', current_setting('transaction_read_only'),
  'databaseBytes', pg_database_size(current_database()),
  -- 参考値。Neon の容量上限は branch の論理容量を数え、この和より大きい（2026-10-21 本番: 和 35,176,448 B、論理容量 50,782,208 B）。
  -- 上限の判定に使う branchLogicalBytes は Neon API から別に足す（doc/document-history-operation.md「観測を取る」）。
  'allDatabasesBytes', (SELECT sum(pg_database_size(d.oid))::bigint FROM pg_database d WHERE NOT d.datistemplate),
  'relations', (
    SELECT jsonb_object_agg(c.relname, jsonb_build_object(
      -- heap は main/fsm/vm。toast は TOAST 本体＋TOAST 索引。heap+toast+indexes = total。
      'heapBytes', pg_table_size(c.oid) - coalesce(pg_total_relation_size(nullif(c.reltoastrelid, 0)), 0),
      'toastBytes', coalesce(pg_total_relation_size(nullif(c.reltoastrelid, 0)), 0),
      'indexBytes', pg_indexes_size(c.oid),
      'totalBytes', pg_total_relation_size(c.oid),
      'deadTuples', coalesce((SELECT n_dead_tup FROM pg_stat_all_tables s WHERE s.relid = c.oid), 0)
    ))
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.relname IN ('document_versions', 'deleted_documents', 'skill_sheets', 'blocks')
  ),
  'versionCount', (SELECT count(*) FROM public.document_versions),
  'deletedDocumentCount', (SELECT count(*) FROM public.deleted_documents),
  -- 本文列の物理（圧縮後）と論理（JSON 文字列）の両方。圧縮率の前提を外から確かめられるようにする。
  'blocksStoredBytes', (SELECT coalesce(sum(pg_column_size(blocks)), 0) FROM public.document_versions),
  'blocksLogicalBytes', (SELECT coalesce(sum(octet_length(blocks::text)), 0) FROM public.document_versions)
)::text AS report;
