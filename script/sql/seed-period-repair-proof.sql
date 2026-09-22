-- 隔離DBのみ。終了未記載とongoing=trueの不一致を合成する。
INSERT INTO public.blocks (id, sheet_id, type, "order", data)
VALUES (
 '00000000-0000-4000-8000-000000000082',
 '00000000-0000-4000-8000-000000000081',
 'project', 0,
 '{"companies":[],"items":[{"id":"00000000-0000-4000-8000-000000000083","companyId":"synthetic-company","title":"repair fixture","scope":"","period":"2026.08 — ","ongoing":true,"duration":"本人原文","role":"","team":"","tech":{"lang":[],"fw":[],"db":[],"infra":[],"tools":[],"collab":[]},"process":[],"duties":"","acquired":"","comment":""}]}'
);

-- 実commit後の別接続再開用。既存CAS競合試験の文書とは分離する。
INSERT INTO public.skill_sheets (id, owner_id, title, is_default)
VALUES ('00000000-0000-4000-8000-000000000091', 'cas-proof', 'committed repair fixture', false);
INSERT INTO public.blocks (id, sheet_id, type, "order", data)
SELECT '00000000-0000-4000-8000-000000000092',
       '00000000-0000-4000-8000-000000000091', type, "order", data
FROM public.blocks WHERE id = '00000000-0000-4000-8000-000000000082';
