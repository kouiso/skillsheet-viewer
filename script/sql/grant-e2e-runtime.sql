-- e2e 専用 DB で、接続 role（SESSION_USER）にアプリ実行時と同じ最小権限だけを与える。
-- script/e2e-isolated-db.sh が install-skillsheet-{read,write}-boundary.sql の後に流す。
-- 使い方: psql -v owner_id=<owner の user.id> -f script/sql/grant-e2e-runtime.sql
--
-- 接続 role は schema・関数・principals の owner ではない（owner は boundary role）。
-- GRANT / INSERT は SET ROLE で owner になってから SESSION_USER へ付ける。
-- membership はこのファイル内で貸して返す。NOINHERIT でも SET ROLE が可能になり、
-- 境界関数を迂回した直接テーブル DML が通ってしまうため、残さない
-- （本番 runtime も USAGE+EXECUTE のみ。install-skillsheet-read-boundary.sql の注記と同じ方針）。
-- 必要なのは schema USAGE と関数 EXECUTE だけ。
GRANT skillsheet_document_reader, skillsheet_document_writer TO CURRENT_USER WITH SET TRUE;
SET ROLE skillsheet_document_reader;
GRANT USAGE ON SCHEMA skillsheet_private TO SESSION_USER;
GRANT EXECUTE ON FUNCTION
  skillsheet_private.read_snapshot(uuid, text),
  skillsheet_private.list_sheets(text)
TO SESSION_USER;
-- e2e の owner は実行ごとに作り直すため、login → owner の写像は毎回この値で張り替える。
INSERT INTO skillsheet_private.principals (login_name, owner_id)
  VALUES (SESSION_USER, :'owner_id')
  ON CONFLICT (login_name) DO UPDATE SET owner_id = EXCLUDED.owner_id;
SET ROLE skillsheet_document_writer;
GRANT EXECUTE ON FUNCTION
  skillsheet_private.replace_sheet(uuid, text, text, jsonb, text),
  skillsheet_private.create_sheet(uuid, text, jsonb, text),
  skillsheet_private.delete_sheet(uuid, text, text)
TO SESSION_USER;
RESET ROLE;
REVOKE skillsheet_document_reader, skillsheet_document_writer FROM CURRENT_USER;
