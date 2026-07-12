'use client';

import type { CompanyInfo, ProjectBlockData, ProjectItem, ProjectTech } from '@skillsheet/db/blocks';
import {
  durationFromRange,
  formatPeriodRange,
  labelsForProcessIndex,
  normalizeProcess,
  PROCESS_LABELS,
  parsePeriodToRange,
} from '@skillsheet/db/process';
import { Trash2 } from 'lucide-react';
import { useMemo } from 'react';

import { KIND_OPTIONS, ROLE_OPTIONS, TECH_CATEGORIES, TECH_SUGGESTIONS } from './editor-constants';
import { TagInput } from './tag-input';

const inputCls =
  'w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring';
const selectCls =
  'w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring';
const textareaCls =
  'w-full resize-y rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring';

/** フォームの 1 フィールド（ラベル + 入力 + ヒント/エラー）。 */
const Field = ({
  label,
  required,
  hint,
  error,
  col2,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string | null;
  col2?: boolean;
  children: React.ReactNode;
}) => (
  <div className={col2 ? 'sm:col-span-2' : undefined}>
    <span className="mb-1 block text-xs font-medium text-muted-foreground">
      {label}
      {required && <span className="ml-0.5 text-destructive">*</span>}
    </span>
    {children}
    {error ? (
      <p className="mt-1 text-xs text-destructive">{error}</p>
    ) : hint ? (
      <p className="mt-1 text-xs text-faint">{hint}</p>
    ) : null}
  </div>
);

/** セクション見出し（番号 + タイトル + 罫線）。 */
const Section = ({ num, title, children }: { num: string; title: string; children: React.ReactNode }) => (
  <section>
    <div className="mb-3 flex items-center gap-2">
      <span className="font-mono text-[11px] text-primary">{num}</span>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <span className="h-px flex-1 bg-border" />
    </div>
    {children}
  </section>
);

interface CompanyBarProps {
  company: CompanyInfo;
  onPatchCompany: (patch: Partial<CompanyInfo>) => void;
  onDeleteCompany: () => void;
}

/**
 * 会社編集バー：名前 / 種別 / 期間（案件から自動導出・読み取り専用）/ 説明 / 削除。
 * 期間は project-editor 側で deriveCompanyPeriod により常に再計算されるため編集不可。
 */
export const CompanyBar = ({ company, onPatchCompany, onDeleteCompany }: CompanyBarProps) => (
  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5">
    <span className="kicker shrink-0">会社</span>
    <input
      value={company.name}
      onChange={(e) => onPatchCompany({ name: e.target.value })}
      placeholder="会社名"
      aria-label="会社名"
      className={`${inputCls} w-52 flex-none`}
    />
    <select
      value={company.kind}
      onChange={(e) => onPatchCompany({ kind: e.target.value })}
      aria-label="会社の種別"
      className={`${selectCls} w-32 flex-none`}
    >
      {/* 既存データの未知の種別は温存表示する（マスタ外の値を消さない） */}
      {!(KIND_OPTIONS as readonly string[]).includes(company.kind) && (
        <option value={company.kind}>{company.kind || '（種別未設定）'}</option>
      )}
      {KIND_OPTIONS.map((k) => (
        <option key={k} value={k}>
          {k}
        </option>
      ))}
    </select>
    <input
      value={company.period}
      readOnly
      tabIndex={-1}
      placeholder="期間：自動計算"
      title="ひもづく案件の期間から自動計算"
      aria-label="会社の期間（自動計算）"
      className={`${inputCls} w-44 flex-none cursor-default font-mono text-xs text-muted-foreground`}
    />
    <input
      value={company.note}
      onChange={(e) => onPatchCompany({ note: e.target.value })}
      placeholder="会社・経歴の説明（任意）"
      aria-label="会社の説明"
      className={`${inputCls} min-w-40 flex-1`}
    />
    <button
      type="button"
      onClick={onDeleteCompany}
      title="この会社を削除"
      className="flex shrink-0 items-center gap-1 rounded border border-border px-2 py-1.5 text-xs text-muted-foreground hover:border-destructive hover:text-destructive"
    >
      <Trash2 className="size-3.5" />
      会社を削除
    </button>
  </div>
);

interface ProjectFormProps {
  project: ProjectItem;
  company: CompanyInfo | undefined;
  data: ProjectBlockData;
  onPatch: (patch: Partial<ProjectItem>) => void;
  onMoveCompany: (companyId: string) => void;
  onPatchCompany: (patch: Partial<CompanyInfo>) => void;
  onDeleteCompany: () => void;
  onDelete: () => void;
}

/**
 * 中央ペイン：会社編集バー + 案件編集フォーム。
 *
 * 期間は `<input type="month">` 2 つ + 継続中チェックで編集し、変更のたびに
 * レガシー period 文字列（"YYYY.MM — YYYY.MM"）へ書き戻す（PDF/ビューアとの互換維持）。
 * 担当工程は 7 工程固定トグル（normalizeProcess ベース）で、対応表にない既存文字列は
 * 読み取り専用チップとして温存する（明示的な × 操作でのみ削除 — 黙って消さない）。
 */
export const ProjectForm = ({
  project: p,
  company,
  data,
  onPatch,
  onMoveCompany,
  onPatchCompany,
  onDeleteCompany,
  onDelete,
}: ProjectFormProps) => {
  const set = <K extends keyof ProjectItem>(key: K, value: ProjectItem[K]) => onPatch({ [key]: value });
  const setTech = (key: keyof ProjectTech, arr: string[]) => onPatch({ tech: { ...p.tech, [key]: arr } });

  // 技術サジェスト：カテゴリ別マスタ + 他案件で使われている値
  const suggestionsFor = (key: keyof ProjectTech) => {
    const used = data.items.flatMap((item) => item.tech?.[key] ?? []);
    return [...new Set([...TECH_SUGGESTIONS[key], ...used])];
  };

  // ── 期間：月入力の初期値は periodStart 優先、無ければレガシー period のパース ──
  const parsedLegacy = useMemo(() => parsePeriodToRange(p.period), [p.period]);
  const hasMonthFields = p.periodStart !== undefined;
  const start = hasMonthFields ? (p.periodStart ?? '') : (parsedLegacy?.start ?? '');
  const end = hasMonthFields ? (p.periodEnd ?? '') : (parsedLegacy?.end ?? '');
  const ongoing = hasMonthFields ? (p.ongoing ?? false) : (parsedLegacy?.ongoing ?? false);
  // レガシー文字列がパース不能（"2020年頃" 等）：月入力は空のまま、元の文字列を注記表示して温存する
  const legacyUnparsable = !hasMonthFields && parsedLegacy === null && p.period.trim().length > 0;

  const commitPeriod = (nextStart: string, nextEnd: string, nextOngoing: boolean) => {
    const formatted = formatPeriodRange(nextStart, nextEnd, nextOngoing);
    // 終了月が開始月より前（逆転）の間はエラー表示のみとし、レガシー period/duration へは
    // 書き戻さない（編集途中の逆転状態を自動保存が拾って閲覧側へ露出させない）。
    const reversed = Boolean(nextStart && nextEnd && !nextOngoing && nextEnd < nextStart);
    onPatch({
      periodStart: nextStart,
      periodEnd: nextEnd,
      ongoing: nextOngoing,
      // start が不正で組み立て不能（''）の間はレガシー period/duration を温存する
      ...(formatted && !reversed
        ? { period: formatted, duration: durationFromRange(nextStart, nextEnd, nextOngoing) }
        : {}),
    });
  };

  const orderError = Boolean(start && end && !ongoing && end < start);
  // 継続中チェック OFF で終了月が未入力（編集途中）の間は入力を促す（バッジも「継続中」と誤表示しない）
  const endMissing = Boolean(start && !end && !ongoing);
  const durationBadge = orderError ? '' : durationFromRange(start, end, ongoing);

  // ── 担当工程：7 工程固定トグル + 温存チップ ──
  const normalized = normalizeProcess(p.process);
  // 7 段いずれかへ「確実に」対応するラベル集合。ここに無い文字列（other + uncertain な「テスト」）は
  // トグルでは操作できないため、読み取り専用チップとして表示し、明示的な × でのみ削除する。
  const certainLabels = useMemo(() => new Set(PROCESS_LABELS.flatMap((_, i) => labelsForProcessIndex(i))), []);
  const preservedChips = p.process.filter((label) => !certainLabels.has(label));

  const toggleProcess = (index: number) => {
    if (normalized.done[index]) {
      // OFF：この index に確実対応する既知ラベルのみ除去（uncertain「テスト」や other は消さない）
      const removable = new Set(labelsForProcessIndex(index));
      set(
        'process',
        p.process.filter((label) => !removable.has(label)),
      );
    } else {
      // ON：7 段モデルの正準ラベルを追加
      set('process', [...p.process, PROCESS_LABELS[index]]);
    }
  };

  const removeProcessLabel = (label: string) =>
    set(
      'process',
      p.process.filter((l) => l !== label),
    );

  return (
    <div className="min-w-0 space-y-4">
      {company && <CompanyBar company={company} onPatchCompany={onPatchCompany} onDeleteCompany={onDeleteCompany} />}

      <div className="space-y-6 rounded-lg border border-border bg-card p-4">
        {/* 1. 基本情報 */}
        <Section num="1" title="基本情報">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="案件タイトル"
              required
              col2
              error={!p.title.trim() ? '必須項目です — 未入力のままだと一覧・閲覧側で「無題」表示になります' : null}
            >
              <input
                value={p.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="例：マッチングアプリ「mypappy」"
                aria-label="案件タイトル"
                className={inputCls}
              />
            </Field>
            <Field label="スコープ / 担当領域" col2 hint="iOS / Android / Web / バックエンド など">
              <input
                value={p.scope}
                onChange={(e) => set('scope', e.target.value)}
                placeholder="例：iOS / Android / Web / バックエンド"
                aria-label="スコープ"
                className={inputCls}
              />
            </Field>
            <Field label="所属会社" required hint="companyId で会社に紐づく">
              <select
                value={p.companyId}
                onChange={(e) => onMoveCompany(e.target.value)}
                aria-label="所属会社"
                className={selectCls}
              >
                {data.companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || '(会社名未入力)'}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="役割">
              <select
                value={p.role}
                onChange={(e) => set('role', e.target.value)}
                aria-label="役割"
                className={selectCls}
              >
                {/* 既存データの未知の役割は温存表示する */}
                {!(ROLE_OPTIONS as readonly string[]).includes(p.role) && (
                  <option value={p.role}>{p.role || '（役割未設定）'}</option>
                )}
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="期間"
              required
              col2
              hint="月数・並び順は自動計算"
              error={
                orderError
                  ? '終了月が開始月より前になっています'
                  : !start && !legacyUnparsable
                    ? '開始月を選択してください'
                    : endMissing
                      ? '終了月を選択するか「継続中」をチェックしてください'
                      : null
              }
            >
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="month"
                  value={start}
                  onChange={(e) => commitPeriod(e.target.value, end, ongoing)}
                  aria-label="開始月"
                  className={`${inputCls} w-40 flex-none font-mono ${!start && !legacyUnparsable ? 'border-destructive' : ''}`}
                />
                <span className="text-muted-foreground">—</span>
                <input
                  type="month"
                  value={ongoing ? '' : end}
                  disabled={ongoing}
                  onChange={(e) => commitPeriod(start, e.target.value, ongoing)}
                  aria-label="終了月"
                  className={`${inputCls} w-40 flex-none font-mono disabled:opacity-40 ${orderError ? 'border-destructive' : ''}`}
                />
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={ongoing}
                    onChange={(e) => commitPeriod(start, e.target.checked ? '' : end, e.target.checked)}
                  />
                  継続中
                </label>
                {durationBadge && (
                  <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                    {durationBadge}
                  </span>
                )}
              </div>
              {legacyUnparsable && (
                <p className="mt-1 text-xs text-faint">
                  旧形式の期間「{p.period}」を保持中 — 月を選択すると新形式で上書きされます
                </p>
              )}
            </Field>
            <Field label="チーム規模">
              <input
                value={p.team}
                onChange={(e) => set('team', e.target.value)}
                placeholder="例：13"
                aria-label="チーム規模"
                className={`${inputCls} font-mono`}
              />
            </Field>
          </div>
        </Section>

        {/* 2. 技術スタック */}
        <Section num="2" title="技術スタック">
          <div className="space-y-2.5">
            {TECH_CATEGORIES.map((cat) => (
              <div key={cat.key} className="grid grid-cols-1 gap-1 sm:grid-cols-[180px_1fr] sm:gap-3">
                <div className="pt-2 text-xs text-muted-foreground">
                  {cat.label}
                  <span className="ml-1 font-mono text-[10px] text-faint">tech.{cat.key}</span>
                </div>
                <TagInput
                  value={p.tech[cat.key] ?? []}
                  onChange={(arr) => setTech(cat.key, arr)}
                  suggestions={suggestionsFor(cat.key)}
                  label={cat.label}
                  placeholder="入力すると候補が出ます（Enterで追加・カンマ区切り可）"
                />
              </div>
            ))}
          </div>
        </Section>

        {/* 3. 担当工程 */}
        <Section num="3" title="担当工程">
          <p className="mb-2 text-xs text-muted-foreground">経験のある工程をクリックで ON / OFF</p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-7">
            {PROCESS_LABELS.map((label, i) => (
              <button
                key={label}
                type="button"
                onClick={() => toggleProcess(i)}
                aria-pressed={normalized.done[i]}
                className={`flex flex-col gap-1.5 rounded border px-2 py-2 text-left text-[11px] transition-colors ${
                  normalized.done[i]
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:border-primary/40'
                }`}
              >
                <span>{label}</span>
                <span
                  className={`h-1 w-full rounded-full ${
                    normalized.done[i] ? 'bg-primary' : normalized.uncertain[i] ? 'bg-primary/30' : 'bg-muted'
                  }`}
                />
              </button>
            ))}
          </div>
          {preservedChips.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="kicker">その他の工程・役割（温存）</span>
              {preservedChips.map((label) => (
                <span key={label} className="chip" title="7工程の対応表にない値。×で削除するまで保持されます">
                  {label}
                  <button
                    type="button"
                    onClick={() => removeProcessLabel(label)}
                    aria-label={`${label} を削除`}
                    className="ml-1 text-muted-foreground hover:text-destructive"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </Section>

        {/* 4. コメント */}
        <Section num="4" title="コメント">
          <div className="space-y-3">
            <Field label="担当業務" hint="≪担当業務≫ — 箇条書きは改行で">
              <textarea
                value={p.duties}
                onChange={(e) => set('duties', e.target.value)}
                rows={4}
                placeholder={'・〇〇の機能開発\n・△△の実装'}
                aria-label="担当業務"
                className={textareaCls}
              />
            </Field>
            <Field label="習得スキル" hint="≪習得スキル≫">
              <textarea
                value={p.acquired}
                onChange={(e) => set('acquired', e.target.value)}
                rows={4}
                placeholder="・〇〇による△△の開発"
                aria-label="習得スキル"
                className={textareaCls}
              />
            </Field>
            <Field label="コメント" hint="≪コメント≫ — 取り組みの背景・工夫・成果">
              <textarea
                value={p.comment}
                onChange={(e) => set('comment', e.target.value)}
                rows={6}
                placeholder="工夫した点や成果を記述…"
                aria-label="コメント"
                className={textareaCls}
              />
            </Field>
            <Field label="要約（任意）" hint="工程の俯瞰カードに表示。空欄なら担当業務を使用">
              <textarea
                value={p.summary ?? ''}
                onChange={(e) => set('summary', e.target.value)}
                rows={2}
                placeholder="案件の要約を1〜3文で記載"
                aria-label="要約"
                className={textareaCls}
              />
            </Field>
          </div>
        </Section>

        {/* 危険操作 */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <span className="font-mono text-[10.5px] text-faint">
            id: {p.id} · companyId: {p.companyId}
          </span>
          <button
            type="button"
            onClick={onDelete}
            className="flex items-center gap-1 rounded border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:border-destructive hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
            この案件を削除
          </button>
        </div>
      </div>
    </div>
  );
};
