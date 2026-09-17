-- 隔離検証clusterにだけ残す合成復旧fixture。実データは含まない。
INSERT INTO public.skill_sheets (id, owner_id, title, is_default, revision)
VALUES ('00000000-0000-4000-8000-000000000091', 'restore-proof', '復旧合成文書', true, 9007199254740993);
INSERT INTO public.blocks (id, sheet_id, type, "order", data)
VALUES ('00000000-0000-4000-8000-000000000092', '00000000-0000-4000-8000-000000000091', 'markdown', 0,
'{"markdown":"原文\n保持","unknown":{"null":null,"array":[1,"2"]}}');
INSERT INTO public.skillsheet_state (owner_id, deleted_sheet_ids)
VALUES ('restore-proof', ARRAY['00000000-0000-4000-8000-000000000093']::uuid[]);
