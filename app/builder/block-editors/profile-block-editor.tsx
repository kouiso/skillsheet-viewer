'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { PROFILE_META_LABELS, type ProfileBlockData, type ProfileMeta } from '@/db/blocks';

// よく使う既知8項目の入力欄（プレースホルダ）。PROFILE_META_LABELS（src/db）と
// キーを揃えること。並び順もここが基準になる。
const KNOWN_PROFILE_META_FIELDS: { key: keyof ProfileMeta; placeholder: string }[] = [
  { key: 'age', placeholder: '例: 30代前半' },
  { key: 'gender', placeholder: '例: 男' },
  { key: 'qualifications', placeholder: '例: 自動車普通車免許' },
  { key: 'education', placeholder: '例: ○○大学卒' },
  { key: 'work', placeholder: '例: フルリモート' },
  { key: 'station', placeholder: '例: ◯◯駅' },
  { key: 'specialties', placeholder: '例: フロントエンド設計' },
  { key: 'expertise', placeholder: '例: チームマネジメント' },
];
const KNOWN_PROFILE_META_KEYS = new Set(KNOWN_PROFILE_META_FIELDS.map((f) => f.key));

let customMetaRowSeq = 0;

/** 既知8項目に無い任意のメタ項目の編集行。ラベル自体を data.meta のキーとして保存する。 */
export interface CustomMetaRow {
  /** React の再レンダリング間でも安定させるためのローカル識別子（保存キーではない）。 */
  id: string;
  label: string;
  value: string;
}

// 既知8項目の表示ラベル（「年齢」等）。任意項目のラベルにこれと同じ文字列を使われると、
// 内部キーは別（例: 既知の `age` と任意項目の `年齢`）でも画面・PDF上は同じラベルで
// 2行表示され紛らわしい（CodeRabbit レビュー指摘）。内部キーと合わせて予約する。
const RESERVED_PROFILE_META_LABELS = new Set(Object.values(PROFILE_META_LABELS));

/**
 * ラベルが既知8項目のキー・表示ラベル、または他の行のラベルと衝突している行の id を返す。
 * 衝突したまま meta へ詰めると `meta[label] = value` の代入が先勝ちの値を無警告で
 * 上書きし、保存後にリロードすると片方が消えたように見える（Codex レビュー指摘）。
 * 最初に出現した行だけを有効とし、以降の同名行は衝突として保存対象から除外する。
 */
const findConflictingRowIds = (rows: CustomMetaRow[]): Set<string> => {
  const conflicts = new Set<string>();
  const seenLabels = new Set<string>();
  for (const row of rows) {
    const label = row.label.trim();
    if (!label) continue;
    if (
      KNOWN_PROFILE_META_KEYS.has(label as keyof ProfileMeta) ||
      RESERVED_PROFILE_META_LABELS.has(label) ||
      seenLabels.has(label)
    ) {
      conflicts.add(row.id);
    } else {
      seenLabels.add(label);
    }
  }
  return conflicts;
};

/**
 * プロフィールブロックのインライン編集（name/title/company/pr/strengths/meta）。
 *
 * meta の既知8項目（年齢・性別・資格・学歴・勤務形態・最寄り駅・得意分野・得意業務）は
 * 固定の入力欄を出す。それ以外の任意項目は「項目を追加」で行を増やせる（Issue #193:
 * 固定4項目のみで、値がある性別・資格を編集画面から直せなかった。固定リストへ1個ずつ
 * 足す設計は同じ問題を再生産するため、任意キーを許容する設計にした）。
 *
 * 任意項目のラベル入力は data.meta のキーそのものを1文字ごとに書き換えると、
 * オブジェクトキーの挿入順が変わって行の並びが跳ねたり、React の key 変化で
 * 入力中にフォーカスが飛んだりする。そのため、ラベル編集中の行識別子はローカル
 * state（CustomMetaRow.id）で持ち、変更のたびに data.meta 全体を組み立て直して
 * 親へ渡す。
 */
export const ProfileBlockEditor = ({
  data,
  onChange,
  id,
  onValidityChange,
  customDraft,
  onCustomDraftChange,
}: {
  data: ProfileBlockData;
  onChange: (data: ProfileBlockData) => void;
  /** items 内でのブロック id。onValidityChange にそのまま渡すためだけに使う。 */
  id: string;
  /** ラベル重複の有無を親へ通知する。親はこれを見て保存（自動/手動）を止める。 */
  onValidityChange: (id: string, hasConflict: boolean) => void;
  /** タブ切替等でアンマウントされたときの未確定自由項目行（#216）。 */
  customDraft?: CustomMetaRow[];
  /** 自由項目行のドラフトを親へ通知する。 */
  onCustomDraftChange?: (rows: CustomMetaRow[]) => void;
}) => {
  const set = <K extends keyof ProfileBlockData>(field: K, value: ProfileBlockData[K]) =>
    onChange({ ...data, [field]: value });
  const setKnownMeta = (key: keyof ProfileMeta, value: string) =>
    onChange({ ...data, meta: { ...(data.meta ?? {}), [key]: value } });

  const [customRows, setCustomRows] = useState<CustomMetaRow[]>(() => {
    if (customDraft) return customDraft;
    return Object.entries(data.meta ?? {})
      .filter((e): e is [string, string] => !KNOWN_PROFILE_META_KEYS.has(e[0]) && e[1] !== undefined)
      .map(([label, value]) => ({ id: `custom-${customMetaRowSeq++}`, label, value }));
  });
  const conflictingRowIds = useMemo(() => findConflictingRowIds(customRows), [customRows]);
  // ラベルが一時的に空（リネーム中の一瞬等）で、かつ値が既にある行。このまま親へ
  // コミットすると値ごと消える（Codex レビュー指摘）ため、確定した状態になるまで
  // commitCustomRows は親へ伝播しない。
  const hasEmptyLabelWithValue = useMemo(
    () => customRows.some((row) => row.label.trim() === '' && row.value.trim() !== ''),
    [customRows],
  );
  const isBlocked = conflictingRowIds.size > 0 || hasEmptyLabelWithValue;
  // アンマウント時（タブ切替・ブロック削除）にも false を報告し、ブロックした保存を解除する。
  // commitCustomRows がブロック中は親へ伝播しないため（下記）、アンマウントで local な
  // customRows が失われても親の data.meta は最後に確定した状態のままで、消えるのは
  // 未確定の編集内容だけ（Codex レビュー指摘: 以前は衝突行を除外した meta を確定として
  // 親へ渡していたため、タブ切替でこのブロックが再マウントすると衝突が解消したかのように
  // 見え、除外済みの内容がそのまま自動保存されてしまっていた）。
  // onValidityChange は親（builder-client 本体）の useCallback（安定参照）をそのまま渡して
  // もらう前提（SortableBlock 側でインライン矢印にラップしない）。ラップすると毎レンダーで
  // 参照が変わり、isBlocked が変わっていなくてもこの effect が再実行され、
  // cleanup の false 報告が直後の true 報告と競合するため。
  useEffect(() => {
    onValidityChange(id, isBlocked);
    return () => onValidityChange(id, false);
  }, [id, isBlocked, onValidityChange]);

  // customRows（ローカル state）が変わるたびに、既知キーと合わせて meta 全体を作り直す。
  // ただし未確定の行（ラベル衝突・ラベル空で値あり）が1つでもあれば親へは伝播しない
  // （画面上は customRows のまま残り、エラー表示で気付ける）。親の data.meta を
  // 「最後に確定した安全な状態」のまま保つことで、タブ切替等での消失を防ぐ。
  const commitCustomRows = (rows: CustomMetaRow[]) => {
    onCustomDraftChange?.(rows);
    setCustomRows(rows);
    const conflicts = findConflictingRowIds(rows);
    if (conflicts.size > 0 || rows.some((row) => row.label.trim() === '' && row.value.trim() !== '')) return;
    // ラベルは編集者の自由入力であり `__proto__` も弾いていない。通常の `{}` に
    // `meta['__proto__'] = row.value` を代入すると、値が文字列（有効なプロトタイプ値
    // ではない）のため代入は黙って無視され、own property が作られずラベルごと消える
    // （CodeRabbit レビュー指摘。実測で確認済み）。Object.create(null) は
    // Object.prototype 自体を継承しないため、`__proto__`/`constructor`/`toString` 等の
    // 予約語でも通常の own property として書き込める。
    const meta = Object.create(null) as ProfileMeta;
    for (const key of KNOWN_PROFILE_META_KEYS) {
      const v = data.meta?.[key];
      if (v !== undefined) meta[key] = v;
    }
    for (const row of rows) {
      const label = row.label.trim();
      if (label) meta[label] = row.value;
    }
    onChange({ ...data, meta });
  };

  const addCustomRow = () => {
    commitCustomRows([...customRows, { id: `custom-${customMetaRowSeq++}`, label: '', value: '' }]);
  };
  const updateCustomRow = (id: string, patch: Partial<Pick<CustomMetaRow, 'label' | 'value'>>) => {
    commitCustomRows(customRows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };
  const removeCustomRow = (id: string) => {
    commitCustomRows(customRows.filter((row) => row.id !== id));
  };

  return (
    <div className="min-w-0 flex-1 space-y-2 text-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">プロフィール</p>
      <div className="grid grid-cols-2 gap-2">
        <input
          value={data.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="名前（例: I・K）"
          aria-label="名前"
          className="min-h-11 rounded border border-input bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <input
          value={data.company ?? ''}
          onChange={(e) => set('company', e.target.value)}
          placeholder="所属会社（例: 株式会社 RITMO）"
          aria-label="所属会社"
          className="min-h-11 rounded border border-input bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <input
        value={data.title}
        onChange={(e) => set('title', e.target.value)}
        placeholder="肩書き（例: フルスタックエンジニア / EM）"
        aria-label="肩書き"
        className="w-full min-h-11 rounded border border-input bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <textarea
        value={data.pr}
        onChange={(e) => set('pr', e.target.value)}
        rows={3}
        placeholder="自己PR"
        aria-label="自己PR"
        className="w-full min-h-11 resize-y rounded border border-input bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <div>
        <p className="mb-1 text-xs text-muted-foreground">強み（1行に1つ）</p>
        <textarea
          value={data.strengths.join('\n')}
          onChange={(e) => set('strengths', e.target.value.split('\n'))}
          rows={3}
          placeholder={'計測ベースのパフォーマンス改善\n開発基盤づくり'}
          aria-label="強み"
          className="w-full min-h-11 resize-y rounded border border-input bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {KNOWN_PROFILE_META_FIELDS.map(({ key, placeholder }) => (
          <div key={key}>
            <p className="mb-1 text-xs text-muted-foreground">{PROFILE_META_LABELS[key]}</p>
            <input
              value={data.meta?.[key] ?? ''}
              onChange={(e) => setKnownMeta(key, e.target.value)}
              placeholder={placeholder}
              aria-label={PROFILE_META_LABELS[key]}
              className="w-full min-h-11 rounded border border-input bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        ))}
      </div>
      {customRows.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">その他の項目</p>
          {customRows.map((row) => {
            const isConflicting = conflictingRowIds.has(row.id);
            // ラベルが空で値だけある行。isBlocked（親への保存ブロック）はこれも見ているが、
            // 従来はラベル衝突（isConflicting）だけを見て aria-invalid・エラー文言を出していた
            // ため、このケースは「保存できません」という全体表示だけが出て、原因の行には
            // 何の印も付かず「重複」という誤った診断になっていた（chatgpt-codex-connector
            // レビュー指摘）。行単位でも実際のブロック理由を出す。
            const isEmptyLabelWithValue = row.label.trim() === '' && row.value.trim() !== '';
            const hasRowError = isConflicting || isEmptyLabelWithValue;
            // aria-invalid だけでは「無効」としか読まれない。理由の文言を id で結び付ける。
            const errorId = `${row.id}-error`;
            return (
              <div key={row.id} className="space-y-1">
                <div className="flex items-center gap-2">
                  <input
                    value={row.label}
                    onChange={(e) => updateCustomRow(row.id, { label: e.target.value })}
                    placeholder="項目名（例: 得意分野）"
                    aria-label="項目名"
                    aria-invalid={hasRowError}
                    aria-describedby={hasRowError ? errorId : undefined}
                    className={`w-28 shrink-0 min-h-11 rounded border bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring ${
                      hasRowError ? 'border-destructive' : 'border-input'
                    }`}
                  />
                  <input
                    value={row.value}
                    onChange={(e) => updateCustomRow(row.id, { value: e.target.value })}
                    placeholder="値"
                    aria-label={row.label || '値'}
                    className="min-w-0 flex-1 min-h-11 rounded border border-input bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <button
                    type="button"
                    onClick={() => removeCustomRow(row.id)}
                    aria-label="この項目を削除"
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                {isConflicting && (
                  <p id={errorId} className="text-xs text-destructive">
                    項目名が他の項目と重複しているため、この項目は保存されません。項目名を変更してください。
                  </p>
                )}
                {!isConflicting && isEmptyLabelWithValue && (
                  <p id={errorId} className="text-xs text-destructive">
                    項目名が未入力のため、この項目は保存されません。項目名を入力してください。
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
      <button
        type="button"
        onClick={addCustomRow}
        className="inline-flex h-11 items-center gap-1 rounded px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Plus className="size-4" />
        項目を追加
      </button>
    </div>
  );
};
