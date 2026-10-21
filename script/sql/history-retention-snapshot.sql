-- 履歴保持 dry-run（#576）の入力を READ ONLY で取り出す。本文・title は出さず、格納サイズと md5 の集約指紋だけを出す。
-- 実行: psql -X -q -v ON_ERROR_STOP=1 -At -f script/sql/history-retention-snapshot.sql
-- 接続先は PGHOST・PGPORT・PGUSER・PGDATABASE で渡し、標準出力の1行を保存して script/history-retention-dry-run.ts の --snapshot に渡す。
-- -q を外すと BEGIN・DO・COMMIT の行が混ざり、dry-run は SNAPSHOT_NOT_JSON で止まる。上の行は verify-history-retention.sh がそのまま実行する。
-- REPEATABLE READ で1つの snapshot に揃え、版・削除・生存シート・台帳の間で時点がずれないようにする。
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
DO $$ BEGIN
  IF current_setting('transaction_read_only') <> 'on' THEN
    RAISE EXCEPTION USING ERRCODE = '25006', MESSAGE = 'RETENTION_SNAPSHOT_REQUIRES_READ_ONLY';
  END IF;
END $$;
SELECT jsonb_build_object(
  'takenAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'versions', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'sheetId', v.sheet_id, 'ownerId', v.owner_id, 'revision', v.revision::text, 'action', v.action,
      'recordedAt', to_char(v.recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'restoredFrom', v.restored_from::text, 'restoredBefore', v.restored_before::text,
      'storedBytes', pg_column_size(v.blocks) + pg_column_size(v.title)
    ) ORDER BY v.sheet_id, v.revision), '[]'::jsonb)
    FROM public.document_versions v),
  'deleted', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'sheetId', d.sheet_id, 'ownerId', d.owner_id, 'revision', d.revision::text,
      'deletedAt', to_char(d.deleted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    ) ORDER BY d.sheet_id), '[]'::jsonb)
    FROM public.deleted_documents d),
  'liveSheets', (
    SELECT coalesce(jsonb_agg(jsonb_build_object('sheetId', s.id, 'ownerId', s.owner_id, 'revision', s.revision::text)
      ORDER BY s.id), '[]'::jsonb)
    FROM public.skill_sheets s),
  'ledger', (
    SELECT coalesce(jsonb_agg(jsonb_build_object('ownerId', t.owner_id, 'deletedSheetIds', to_jsonb(t.deleted_sheet_ids))
      ORDER BY t.owner_id), '[]'::jsonb)
    FROM public.skillsheet_state t),
  -- 内容が変われば計画を作り直させるための指紋。md5 の md5 なので本文は復元できない。
  'contentFingerprint', (
    SELECT md5(coalesce(string_agg(md5(v.title || chr(31) || v.blocks::text), ',' ORDER BY v.sheet_id, v.revision), ''))
    FROM public.document_versions v)
)::text AS snapshot;
COMMIT;
