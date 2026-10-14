-- e2e 専用 DB で、接続 role に文書履歴の公開入口 6 関数の EXECUTE だけを与える。
-- script/e2e-isolated-db.sh が install-document-history.sql の後に流す。
-- helper・履歴テーブル・role membership は残さない。失敗時の一時 membership も transaction で戻す。
BEGIN;
GRANT skillsheet_document_writer TO CURRENT_USER WITH SET TRUE;
SET ROLE skillsheet_document_writer;
GRANT EXECUTE ON FUNCTION
  skillsheet_private.history_list(uuid,text,integer,text),
  skillsheet_private.history_read(uuid,text,text),
  skillsheet_private.history_count_after(uuid,text,text,text),
  skillsheet_private.history_restore(uuid,text,text,text),
  skillsheet_private.deleted_document_list(text),
  skillsheet_private.restore_deleted_document(uuid,text,text)
TO SESSION_USER;
RESET ROLE;
REVOKE skillsheet_document_writer FROM CURRENT_USER;
COMMIT;
