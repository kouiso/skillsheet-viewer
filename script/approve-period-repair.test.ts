import { expect, it } from 'vitest';
import { parseApprovePeriodRepairArgs } from './approve-period-repair';

const args = [
  '--owner',
  'owner-a',
  '--sheet-id',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '--proposal',
  '/private/proposal.json',
  '--journal',
  '/private/change',
  '--before-hash',
  'a'.repeat(64),
  '--after-hash',
  'b'.repeat(64),
];
it('本人確認の前後ハッシュを両方必須にする', () => {
  expect(parseApprovePeriodRepairArgs(args).confirmed).toEqual({
    beforeHash: 'a'.repeat(64),
    afterHash: 'b'.repeat(64),
  });
  expect(() => parseApprovePeriodRepairArgs(args.slice(0, -2))).toThrow();
  expect(() => parseApprovePeriodRepairArgs(args.map((value) => (value === 'b'.repeat(64) ? 'yes' : value)))).toThrow();
});
it('不明オプション・重複・相対パス・対象不足を拒否する', () => {
  for (const input of [
    [],
    [...args, '--write', 'true'],
    [...args, '--owner', 'other'],
    args.map((value) => (value === '/private/change' ? 'relative' : value)),
  ]) {
    expect(() => parseApprovePeriodRepairArgs(input)).toThrow();
  }
});
