import type { CompanyInfo, ProjectBlockData, ProjectItem } from '@skillsheet/db/blocks';

/**
 * 案件エディタの変更履歴（claude.ai/design `editor/history.jsx` の移植）。
 *
 * 保存先はブラウザの localStorage。サーバへは送らないため、同じブラウザでのみ遡れる
 * 「取り消し用の控え」という位置づけ。正本はあくまで DB 側で、ここは事故ったときに
 * 直前の状態へ戻すための手段。
 */

export const HISTORY_STORAGE_KEY = 'ss_editor_history_v1';

/** 保持する件数。これを超えたら古いものから捨てる。 */
export const HISTORY_LIMIT = 30;

/** 同じラベルの変更がこの秒数以内に続いたら、1件にまとめる（1文字打つたびに増やさない）。 */
const MERGE_WINDOW_MS = 90_000;

export interface HistoryEntry {
  /**
   * 一覧の並び替え・再描画に耐える安定キー。
   * 記録時刻だけだと同じミリ秒に2件積まれたとき衝突するため、別に持つ。
   * 旧バージョンで保存された履歴には無いので、読み出し側は未定義を許容する。
   */
  id?: string;
  /** 記録時刻（epoch ミリ秒）。 */
  at: number;
  /** 日本語の変更内容。 */
  label: string;
  /** 変更「後」の状態。ここへ戻す。 */
  snapshot: ProjectBlockData;
}

/** 差分ラベルに出す項目名。ここに無いキーは「その他」へ寄せる。 */
const FIELD_NAMES: Record<string, string> = {
  title: 'タイトル',
  scope: 'スコープ',
  period: '期間',
  periodStart: '期間',
  periodEnd: '期間',
  ongoing: '期間',
  duration: '期間',
  role: '役割',
  team: 'チーム規模',
  tech: '技術スタック',
  process: '担当工程',
  duties: '担当業務',
  acquired: '習得スキル',
  comment: 'コメント',
  summary: '要約',
  companyId: '所属会社',
};

const projectLabel = (p: ProjectItem | undefined): string => p?.title?.trim() || '無題の案件';
const companyLabel = (c: CompanyInfo | undefined): string => c?.name?.trim() || '会社名未入力';

/** 変更のあったフィールド名を日本語で、重複を除いて並べる。 */
const changedFieldNames = (before: ProjectItem, after: ProjectItem): string[] => {
  const names: string[] = [];
  for (const key of Object.keys({ ...before, ...after })) {
    if (key === 'id' || key === 'hidden') continue;
    const a = before[key as keyof ProjectItem];
    const b = after[key as keyof ProjectItem];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    const name = FIELD_NAMES[key] ?? 'その他';
    if (!names.includes(name)) names.push(name);
  }
  return names;
};

/** 「タイトル・期間 ほか2件」の形にまとめる。 */
const joinFieldNames = (names: string[]): string => {
  if (names.length === 0) return '内容';
  const head = names.slice(0, 2).join('・');
  return names.length > 2 ? `${head} ほか${names.length - 2}件` : head;
};

/**
 * 変更前後から日本語のラベルを作る。
 * 判定の順番は「構造の変化 → 表示状態 → 中身の編集」。件数の増減や並び替えのほうが
 * 後から探すときの手がかりになるため先に見る。
 */
export const describeChange = (prev: ProjectBlockData, next: ProjectBlockData): string => {
  // 会社の増減
  if (next.companies.length > prev.companies.length) {
    const added = next.companies.find((c) => !prev.companies.some((p) => p.id === c.id));
    return `会社「${companyLabel(added)}」を追加`;
  }
  if (next.companies.length < prev.companies.length) {
    const removed = prev.companies.find((c) => !next.companies.some((n) => n.id === c.id));
    return `会社「${companyLabel(removed)}」を削除`;
  }
  // 案件の増減
  if (next.items.length > prev.items.length) {
    const added = next.items.find((p) => !prev.items.some((q) => q.id === p.id));
    return `案件「${projectLabel(added)}」を追加`;
  }
  if (next.items.length < prev.items.length) {
    const removed = prev.items.find((p) => !next.items.some((q) => q.id === p.id));
    return `案件「${projectLabel(removed)}」を削除`;
  }
  // 並び替え（構成メンバーは同じで順番だけ違う）
  if (prev.companies.map((c) => c.id).join() !== next.companies.map((c) => c.id).join()) {
    return '会社を並び替え';
  }
  if (prev.items.map((p) => p.id).join() !== next.items.map((p) => p.id).join()) {
    return '案件を並び替え';
  }
  // 表示/非表示
  for (const after of next.companies) {
    const before = prev.companies.find((c) => c.id === after.id);
    if (before && Boolean(before.hidden) !== Boolean(after.hidden)) {
      return `会社「${companyLabel(after)}」を${after.hidden ? '非表示' : '表示'}に`;
    }
  }
  for (const after of next.items) {
    const before = prev.items.find((p) => p.id === after.id);
    if (before && Boolean(before.hidden) !== Boolean(after.hidden)) {
      return `案件「${projectLabel(after)}」を${after.hidden ? '非表示' : '表示'}に`;
    }
  }
  // 中身の編集
  for (const after of next.items) {
    const before = prev.items.find((p) => p.id === after.id);
    if (!before) continue;
    const names = changedFieldNames(before, after);
    if (names.length > 0) return `「${projectLabel(after)}」の${joinFieldNames(names)}を編集`;
  }
  for (const after of next.companies) {
    const before = prev.companies.find((c) => c.id === after.id);
    if (!before) continue;
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      return `会社「${companyLabel(after)}」の情報を編集`;
    }
  }
  return '編集';
};

/** localStorage から履歴を読む。壊れていた場合は空として扱う（履歴のために編集を止めない）。 */
export const loadHistory = (): HistoryEntry[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
  } catch {
    return [];
  }
};

/**
 * 履歴へ 1 件積む。先頭が最新。
 *
 * - 直近 MERGE_WINDOW_MS 以内に同じラベルが積まれていれば、それを差し替える
 *   （長文を打っている間に「コメントを編集」が何十件も並ぶのを防ぐ）
 * - HISTORY_LIMIT を超えたぶんは古いほうから捨てる
 * - 容量超過で保存できない場合は、件数を半分にして 1 度だけ再試行する
 */
export const pushHistory = (prev: ProjectBlockData, next: ProjectBlockData, now: number): HistoryEntry[] => {
  const label = describeChange(prev, next);
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `h-${now}-${Math.random().toString(36).slice(2)}`;
  const entry: HistoryEntry = { id, at: now, label, snapshot: next };
  const current = loadHistory();
  const head = current[0];
  const merged = head && head.label === label && now - head.at < MERGE_WINDOW_MS;
  const list = (merged ? [entry, ...current.slice(1)] : [entry, ...current]).slice(0, HISTORY_LIMIT);

  if (typeof window === 'undefined') return list;
  try {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // 容量超過。古い半分を捨てて 1 度だけやり直す。それでも駄目なら履歴を諦める（編集は続行）。
    try {
      const trimmed = list.slice(0, Math.max(1, Math.floor(HISTORY_LIMIT / 2)));
      window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(trimmed));
      return trimmed;
    } catch {
      return list;
    }
  }
  return list;
};

/** 「たった今 / N分前 / 今日 HH:MM / M/D HH:MM」。時刻そのものより「どれくらい前か」を優先する。 */
export const formatHistoryTime = (at: number, now: number): string => {
  const diff = now - at;
  if (diff < 60_000) return 'たった今';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分前`;
  const date = new Date(at);
  const hhmm = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  const today = new Date(now);
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  return sameDay ? `今日 ${hhmm}` : `${date.getMonth() + 1}/${date.getDate()} ${hhmm}`;
};
