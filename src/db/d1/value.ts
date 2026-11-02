/** 移行codecと共通の格納形式。runtimeのclockはms精度だが小数秒は6桁に揃える。 */
export function d1Timestamp(date = new Date()): string {
  return date.toISOString().replace('Z', '000Z');
}

/** signed64bitの版をNumberへ通さず増分する。最大版では書き込みを拒否する。 */
export function nextD1Revision(revision: string): string {
  if (revision === '9223372036854775807') return revision;
  return (BigInt(revision) + 1n).toString();
}
