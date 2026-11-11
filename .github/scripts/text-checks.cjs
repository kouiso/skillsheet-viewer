// issue・PR・コメント本文の書き方チェックと公開内容チェック（#615）。
// 文字の規則だけで判定する（AI・外部サービス・新しい認証情報は使わない）。
// 本文の自動編集・自動削除はしない。見つけて知らせるだけ。
// 共通版（brain #110）ができたら、この判定部分はその写しに差し替え、
// 呼び出し（workflow）と設定（.github/text-checks.config.json）だけをこのリポに残す。
'use strict';

const HEADING = /^(#{2,4})\s+(.+?)\s*#*\s*$/;

function normalizeHeading(text) {
  return String(text).replace(/\s+/g, '').toLowerCase();
}

// 「## 見出し」ごとに本文を分ける。フォームで作ると「###」になるので 2〜4 段を見る。
function splitSections(body) {
  const sections = new Map();
  let current = null;
  for (const line of String(body || '').split(/\r?\n/)) {
    const m = line.match(HEADING);
    if (m) {
      current = normalizeHeading(m[2]);
      if (!sections.has(current)) sections.set(current, []);
      continue;
    }
    if (current) sections.get(current).push(line);
  }
  return sections;
}

// 見出しだけ・「-」だけ・コメントだけ・フォームの「_No response_」は未記入。
function isFilled(lines) {
  const text = (lines || []).join('\n').replace(/<!--[\s\S]*?-->/g, '');
  return text
    .split('\n')
    .map((l) => l.trim())
    .some((l) => l !== '' && !/^[-*]\s*(\[\s?\])?\s*$/.test(l) && l !== '_No response_' && l !== '---');
}

function findSection(sections, spec) {
  for (const name of [spec.name, ...(spec.aliases || [])]) {
    const key = normalizeHeading(name);
    if (sections.has(key)) return sections.get(key);
  }
  return null;
}

function checkSections(body, requiredSections) {
  const sections = splitSections(body);
  const missing = [];
  for (const spec of requiredSections) {
    const lines = findSection(sections, spec);
    if (lines === null) missing.push({ name: spec.name, reason: '見出しがない' });
    else if (!isFilled(lines)) missing.push({ name: spec.name, reason: '中身が書いていない' });
  }
  return missing;
}

function checkIssueFormat(body, config) {
  const missing = checkSections(body, config.issue.requiredSections);
  return { ok: missing.length === 0, missing };
}

function checkPrFormat(body, config) {
  const pr = config.pullRequest;
  const missing = checkSections(body, pr.requiredSections);
  const related = new RegExp(pr.relatedIssuePattern, 'i');
  const text = String(body || '').replace(/<!--[\s\S]*?-->/g, '');
  if (!related.test(text)) missing.push({ name: '関連Issue', reason: '`Closes #番号` か `Refs #番号` がない' });
  return { ok: missing.length === 0, missing };
}

// 当たった規則・行番号・件数だけを返す。当たった文字そのものは返さない。
function checkPublicContent(body, config) {
  const findings = [];
  const lines = String(body || '').split(/\r?\n/);
  for (const rule of config.publicContent.rules) {
    const flags = `g${(rule.flags || '').replace(/g/g, '')}`;
    const re = new RegExp(rule.pattern, flags);
    const hitLines = [];
    let count = 0;
    lines.forEach((line, i) => {
      re.lastIndex = 0;
      const n = (line.match(re) || []).length;
      if (n > 0) {
        hitLines.push(i + 1);
        count += n;
      }
    });
    if (count > 0) findings.push({ id: rule.id, label: rule.label, lines: hitLines, count });
  }
  return { ok: findings.length === 0, findings };
}

function isBotActor(login, config) {
  if (!login) return false;
  return login.endsWith('[bot]') || (config.skipActors || []).includes(login);
}

// 書き方チェックの対象外: ボット作成・アラート系ラベル付き issue・下書き PR。
function shouldSkipFormat({ kind, author, labels = [], draft = false }, config) {
  if (isBotActor(author, config)) return true;
  if (kind === 'pull_request' && draft) return true;
  if (kind === 'issue' && labels.some((l) => (config.skipIssueLabels || []).includes(l))) return true;
  return false;
}

function formatReport(kind, result, config) {
  const marker = `${config.marker}:${kind}`;
  if (kind === 'public') {
    if (result.ok) return `${marker}\n公開内容チェック: OK（当たった規則はありません）`;
    const rows = result.findings.map((f) => `- ${f.label}（\`${f.id}\`）: ${f.count}件、${f.lines.join('・')}行目`);
    return [
      marker,
      '公開内容チェック: 要確認',
      '公開リポに書いてはいけない形の文字が見つかりました。当たった文字はここには書きません。本文を直してください。',
      ...rows,
    ].join('\n');
  }
  if (result.ok) return `${marker}\n書き方チェック: OK`;
  const rows = result.missing.map((m) => `- ${m.name}: ${m.reason}`);
  return [marker, '書き方チェック: 足りない項目があります', ...rows].join('\n');
}

// 非公開の規則を secret から読む。中身（語や式）は返り値の pattern にだけ入れ、
// id と label は「private-番号」にして、知らせる文やログに語の手がかりを出さない。
// 形: JSON 配列。各要素は文字列（そのまま語）か { "pattern": "...", "flags": "i" }。
function loadPrivateRules(raw) {
  if (!raw || !String(raw).trim()) return [];
  let list;
  try {
    list = JSON.parse(raw);
  } catch {
    throw new Error('TEXT_CHECKS_PRIVATE_RULES が JSON として読めない（中身は表示しない）');
  }
  if (!Array.isArray(list)) throw new Error('TEXT_CHECKS_PRIVATE_RULES は配列にする（中身は表示しない）');
  return list.map((item, i) => {
    const id = `private-${i + 1}`;
    if (typeof item === 'string') {
      return { id, label: '非公開の規則', pattern: item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags: 'i' };
    }
    return { id, label: '非公開の規則', pattern: String(item.pattern), flags: item.flags || '' };
  });
}

module.exports = {
  loadPrivateRules,
  splitSections,
  isFilled,
  checkIssueFormat,
  checkPrFormat,
  checkPublicContent,
  shouldSkipFormat,
  isBotActor,
  formatReport,
};
