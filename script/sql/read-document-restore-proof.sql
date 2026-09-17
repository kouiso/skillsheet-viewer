-- 時刻、未知raw、UUID順序、巨大版、削除履歴を含む文書3表の完全な比較値。
SELECT jsonb_build_object(
 'sheets', (SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.skill_sheets s),
 'blocks', (SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM public.blocks b),
 'state', (SELECT jsonb_agg(to_jsonb(t) ORDER BY owner_id) FROM public.skillsheet_state t)
);
