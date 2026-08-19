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
import { useMemo } from 'react';

import { KIND_OPTIONS, ROLE_OPTIONS, TECH_CATEGORIES, TECH_SUGGESTIONS } from './editor-constants';
import { GrowTextarea } from './grow-textarea';
import { MonthDatePicker } from './month-date-picker';
import { ScopePicker } from './scope-picker';
import { TagInput } from './tag-input';

/** フォームの 1 フィールド（ラベル + 入力 + ヒント/エラー）。 */
const Field = ({
  label,
  required,
  hint,
  error,
  col2,
  syncKey,
  onFocus,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string | null;
  col2?: boolean;
  /** プレビューの対応箇所へ結びつけるキー。 */
  syncKey?: string;
  onFocus?: () => void;
  children: React.ReactNode;
}) => (
  <div className={`field${col2 ? ' col-2' : ''}`} data-sync={syncKey} onFocusCapture={onFocus}>
    {/* biome-ignore lint/a11y/noLabelWithoutControl: 入力側に aria-label を付けており、
        ここはグリッド上の見出しとして使う（design の .field label と同じ役割）。 */}
    <label>
      {label}
      {required && <span className="req">*</span>}
    </label>
    {children}
    {error ? <p className="hint err">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
  </div>
);

/** セクション見出し（番号バッジ + タイトル + 罫線）。 */
const Section = ({ num, title, children }: { num: string; title: string; children: React.ReactNode }) => (
  <section className="fsec">
    <div className="fsec-head">
      <span className="num">{num}</span>
      <h3>{title}</h3>
      <span className="line" />
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
  <div className="co-editbar">
    <span className="lab">COMPANY</span>
    <input
      value={company.name}
      onChange={(e) => onPatchCompany({ name: e.target.value })}
      placeholder="会社名"
      aria-label="会社名"
      className="inp"
      style={{ width: 220, flex: '0 0 auto' }}
    />
    <select
      value={company.kind}
      onChange={(e) => onPatchCompany({ kind: e.target.value })}
      aria-label="会社の種別"
      className="sel"
      style={{ width: 130, flex: '0 0 auto' }}
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
      className="inp ro"
      style={{ width: 170, flex: '0 0 auto', fontFamily: 'var(--font-mono)', fontSize: 12 }}
    />
    <input
      value={company.note}
      onChange={(e) => onPatchCompany({ note: e.target.value })}
      placeholder="会社・経歴の説明（任意）"
      aria-label="会社の説明"
      className="inp"
      style={{ flex: '1 1 160px', minWidth: 160 }}
    />
    <button type="button" onClick={onDeleteCompany} title="この会社を削除" className="btn sm danger">
      会社を削除
    </button>
  </div>
);

interface ProjectFormProps {
  project: ProjectItem;
  data: ProjectBlockData;
  onPatch: (patch: Partial<ProjectItem>) => void;
  onMoveCompany: (companyId: string) => void;
  onDelete: () => void;
  /** 編集中の欄に対応するプレビュー箇所を光らせる（同期ジャンプ）。 */
  onFieldFocus?: (syncKey: string) => void;
}

/**
 * 中央ペイン：案件編集フォーム。
 *
 * 期間は月ピッカー 2 つ + 継続中チェックで編集し、変更のたびに
 * レガシー period 文字列（"YYYY.MM — YYYY.MM"）へ書き戻す（PDF/ビューアとの互換維持）。
 * 担当工程は 7 工程固定トグル（normalizeProcess ベース）で、対応表にない既存文字列は
 * 読み取り専用チップとして温存する（明示的な × 操作でのみ削除 — 黙って消さない）。
 */
export const ProjectForm = ({ project: p, data, onPatch, onMoveCompany, onDelete, onFieldFocus }: ProjectFormProps) => {
  const set = <K extends keyof ProjectItem>(key: K, value: ProjectItem[K]) => onPatch({ [key]: value });
  const setTech = (key: keyof ProjectTech, arr: string[]) => onPatch({ tech: { ...p.tech, [key]: arr } });
  const focus = (syncKey: string) => () => onFieldFocus?.(syncKey);

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
  // 7 段いずれかへ対応するラベル集合。ここに無い文字列（素の「テスト」等の other）は
  // トグルでは操作できないため、読み取り専用チップとして表示し、明示的な × でのみ削除する。
  const knownLabels = useMemo(() => new Set(PROCESS_LABELS.flatMap((_, i) => labelsForProcessIndex(i))), []);
  const preservedChips = p.process.filter((label) => !knownLabels.has(label));

  const toggleProcess = (index: number) => {
    if (normalized.done[index]) {
      // OFF：この index に対応する既知ラベルのみ除去（other は消さない）
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
    <div className="form-inner fadein">
      {/* 1. 基本情報 */}
      <Section num="1" title="基本情報">
        <div className="fgrid">
          <Field
            label="案件タイトル"
            required
            col2
            syncKey="title"
            onFocus={focus('title')}
            error={!p.title.trim() ? '必須項目です — 未入力のままだと一覧・閲覧側で「無題」表示になります' : null}
          >
            <input
              value={p.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="例：マッチングアプリの開発"
              aria-label="案件タイトル"
              className={`inp${!p.title.trim() ? ' err' : ''}`}
            />
          </Field>

          <Field
            label="スコープ / 担当領域"
            col2
            syncKey="scope"
            onFocus={focus('scope')}
            hint="複数選択できます。一覧に無いものは「＋ その他」から追加"
          >
            <ScopePicker value={p.scope} onChange={(v) => set('scope', v)} />
          </Field>

          <Field label="所属会社" required hint="companyId で会社に紐づく">
            <select
              value={p.companyId}
              onChange={(e) => onMoveCompany(e.target.value)}
              aria-label="所属会社"
              className="sel"
            >
              {data.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || '(会社名未入力)'}
                </option>
              ))}
            </select>
          </Field>

          <Field label="役割" syncKey="meta" onFocus={focus('meta')}>
            <select value={p.role} onChange={(e) => set('role', e.target.value)} aria-label="役割" className="sel">
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
            syncKey="period"
            onFocus={focus('period')}
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
            <div className="period-row">
              <MonthDatePicker
                value={start}
                onChange={(v) => commitPeriod(v, end, ongoing)}
                label="開始月"
                placeholder="開始月"
                error={!start && !legacyUnparsable}
              />
              <span className="sep">—</span>
              <MonthDatePicker
                value={ongoing ? '' : end}
                onChange={(v) => commitPeriod(start, v, ongoing)}
                label="終了月"
                // 「継続中」がチェックボックスラベル・期間バッジと合わせて3箇所に重複していた
                // （#152 S-5）。終了月欄は無効化された時点で理由が伝わるため空にする。
                placeholder={ongoing ? '' : '終了月'}
                disabled={ongoing}
                error={orderError}
              />
              <label className="period-ongoing">
                <input
                  type="checkbox"
                  checked={ongoing}
                  onChange={(e) => commitPeriod(start, e.target.checked ? '' : end, e.target.checked)}
                />
                継続中
              </label>
              {durationBadge && <span className={`dur-badge${ongoing ? ' live' : ''}`}>{durationBadge}</span>}
            </div>
            {legacyUnparsable && (
              <p className="hint">旧形式の期間「{p.period}」を保持中 — 月を選択すると新形式で上書きされます</p>
            )}
          </Field>

          <Field label="チーム規模" syncKey="meta" onFocus={focus('meta')}>
            <input
              value={p.team}
              onChange={(e) => set('team', e.target.value)}
              placeholder="例：13"
              aria-label="チーム規模"
              className="inp"
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </Field>
        </div>
      </Section>

      {/* 2. 技術スタック */}
      <Section num="2" title="技術スタック">
        <div data-sync="tech" onFocusCapture={focus('tech')}>
          {TECH_CATEGORIES.map((cat) => (
            <div key={cat.key} className="techrow">
              <div className="cat">
                {cat.label}
                <small>tech.{cat.key}</small>
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
        {/* onFocusCapture は中の button から上がってくるフォーカスを拾うだけで、この div 自体は
            操作対象ではない（クリック用のハンドラも持たない）。 */}
        <div data-sync="process" onFocusCapture={focus('process')}>
          <p className="hint" style={{ marginBottom: 10 }}>
            経験のある工程をクリックで ON / OFF
          </p>
          <div className="proc-edit">
            {PROCESS_LABELS.map((label, i) => (
              <button
                key={label}
                type="button"
                onClick={() => toggleProcess(i)}
                aria-pressed={normalized.done[i]}
                className={`proc-cell${normalized.done[i] ? ' on' : ''}`}
              >
                <span className="pl">{label}</span>
                <span className="pbar" />
              </button>
            ))}
          </div>
        </div>
        {preservedChips.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="kicker">その他の工程・役割（温存）</span>
            {preservedChips.map((label) => (
              <span key={label} className="tag" title="7工程の対応表にない値。×で削除するまで保持されます">
                {label}
                <button type="button" onClick={() => removeProcessLabel(label)} aria-label={`${label} を削除`}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </Section>

      {/* 4. コメント */}
      <Section num="4" title="コメント">
        <div className="fgrid">
          <Field label="担当業務" col2 hint="≪担当業務≫ — 箇条書きは改行で">
            <GrowTextarea
              value={p.duties}
              onChange={(v) => set('duties', v)}
              label="担当業務"
              placeholder={'・〇〇の機能開発\n・△△の実装'}
              syncKey="duties"
              onFocus={focus('duties')}
            />
          </Field>
          <Field label="習得スキル" col2 hint="≪習得スキル・実績≫">
            <GrowTextarea
              value={p.acquired}
              onChange={(v) => set('acquired', v)}
              label="習得スキル"
              placeholder="・〇〇による△△の開発"
              syncKey="acquired"
              onFocus={focus('acquired')}
            />
          </Field>
          <Field label="コメント" col2 hint="≪コメント≫ — 取り組みの背景・工夫・成果">
            <GrowTextarea
              value={p.comment}
              onChange={(v) => set('comment', v)}
              label="コメント"
              placeholder="工夫した点や成果を記述…"
              syncKey="comment"
              onFocus={focus('comment')}
            />
          </Field>
          <Field label="要約（任意）" col2 hint="工程の俯瞰カードに表示。空欄なら担当業務を使用">
            <GrowTextarea
              value={p.summary ?? ''}
              onChange={(v) => set('summary', v)}
              label="要約"
              placeholder="案件の要約を1〜3文で記載"
              syncKey="summary"
              onFocus={focus('summary')}
            />
          </Field>
        </div>
      </Section>

      {/* 危険操作 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <span className="font-mono text-[11px] text-faint">
          id: {p.id} · company_id: {p.companyId}
        </span>
        <button type="button" onClick={onDelete} className="btn sm danger">
          この案件を削除
        </button>
      </div>
    </div>
  );
};
