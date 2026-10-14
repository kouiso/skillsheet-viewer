import { mkdtempSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { appendNarrativeJournal, readNarrativeJournal } from './script/narrative-journal';
const good = { version: 1, state: 'approved', owner: 'owner-a', sheetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', expectedRevision: '42', beforeHash: 'b'.repeat(64), afterHash: 'a'.repeat(64), changeIds: ['bbbb:dddd:duties'], at: '2026-09-17T00:00:00.000Z' };
const canon = (o: any) => JSON.stringify(o, Object.keys(o).sort());
function file(body: string) { const d = mkdtempSync(path.join(tmpdir(), 'j-')); chmodSync(d, 0o700); const p = path.join(d, 'journal.jsonl'); writeFileSync(p, body, { mode: 0o600 }); return p; }
function tryRead(label: string, body: string) {
  const p = file(body);
  try { const r = readNarrativeJournal(p); console.log(`${label}: 受け入れた（${r.length}件）`); }
  catch (e: any) { console.log(`${label}: 拒否 -> ${String(e.message).slice(0, 60)}`); }
}
function tryAppend(label: string, body: string) {
  const p = file(body); const before = readFileSync(p);
  try { appendNarrativeJournal(p, good as any); console.log(`${label}: 追記した（元のbyte列${before.equals(readFileSync(p).subarray(0, before.length)) ? 'の後ろに' : 'を変更して'}書き込み）`); }
  catch (e: any) { console.log(`${label}: 追記を拒否・元のまま=${before.equals(readFileSync(p))} -> ${String(e.message).slice(0, 60)}`); }
}
console.log('# 架空データのみ（実データ不使用）');
tryRead('1 正常な記録', canon(good) + '\n');
tryRead('2 状態が "future"', canon({ ...good, state: 'future' }) + '\n');
tryRead('3 sheetId が "invalid"', canon({ ...good, sheetId: 'invalid' }) + '\n');
tryRead('4 hash が "invalid"', canon({ ...good, beforeHash: 'invalid' }) + '\n');
tryRead('5 余分なキー extra', canon({ ...good, extra: true }) + '\n');
tryRead('6 null', 'null\n');
tryAppend('7 末尾が途中行の journal へ追記', canon(good) + '\n{"version":1,"sta');
