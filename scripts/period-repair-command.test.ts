import { describe, expect, it } from 'vitest';
import { parsePeriodRepairCommand } from './period-repair-command';

const args = [
  '--action',
  'resume',
  '--journal',
  '/private/change',
  '--owner',
  'owner-a',
  '--sheet-id',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
];
describe('修復コマンドの明示対象', () => {
  it('再開と取り消しだけを受け付ける', () => {
    expect(parsePeriodRepairCommand(args).action).toBe('resume');
    expect(parsePeriodRepairCommand(args.map((value) => (value === 'resume' ? 'revert' : value))).action).toBe(
      'revert',
    );
  });
  it.each([
    { input: [] },
    { input: args.slice(2) },
    { input: [...args, '--write', 'true'] },
    { input: [...args, '--owner', 'other'] },
    { input: args.map((value) => (value === '/private/change' ? 'relative' : value)) },
    { input: args.map((value) => (value === 'resume' ? 'approve' : value)) },
    { input: args.map((value) => (value === 'owner-a' ? ' owner-a' : value)) },
    { input: args.slice(0, -1) },
  ])('曖昧な操作・暗黙対象を拒否する %#', ({ input }) => {
    expect(() => parsePeriodRepairCommand(input)).toThrow();
  });
});
