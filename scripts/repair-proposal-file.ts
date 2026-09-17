import { closeSync, constants, fstatSync, fsyncSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { canonicalJson } from '../src/db/document-contract';
import type { PeriodRepairProposal } from './period-repair-proposal';

/** 既存の非公開ディレクトリに未承認案を固定する。同名の別案を上書きしない。 */
export function persistRepairProposal(path: string, proposal: PeriodRepairProposal): void {
  if (proposal.approved !== false) throw new Error('UNAPPROVED_PROPOSAL_REQUIRED');
  persistPrivateRepairRecord(path, proposal);
}

/** 修復用の不変記録。呼出元で記録種別と承認対象を検査する。 */
export function persistPrivateRepairRecord(path: string, record: unknown): void {
  const body = canonicalJson(record);
  const dir = openSync(dirname(path), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(dir);
    if ((stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid())) {
      throw new Error('PRIVATE_DIRECTORY_REQUIRED');
    }
    // Linux上のCLI用。ディレクトリを検査後に差し替えられても別の場所へ書き込まない。
    const target = `/proc/self/fd/${dir}/${basename(path)}`;
    let fd: number;
    try {
      fd = openSync(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const existing = openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        const file = fstatSync(existing);
        if (!file.isFile() || (file.mode & 0o077) !== 0 || (process.getuid && file.uid !== process.getuid())) {
          throw new Error('PRIVATE_FILE_REQUIRED');
        }
        if (readFileSync(existing, 'utf8') !== body) throw new Error('PROPOSAL_FILE_CONFLICT');
        // 前回が書込み後・同期前に中断していても、成功を返す前に記録を永続化する。
        fsyncSync(existing);
        fsyncSync(dir);
      } finally {
        closeSync(existing);
      }
      return;
    }
    try {
      writeFileSync(fd, body);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    fsyncSync(dir);
  } finally {
    closeSync(dir);
  }
}

/** 私有記録をJSONとして読む。戻り値の種別・承認内容は呼出元で検証する。 */
export function readPrivateRepairRecord(path: string): unknown {
  const dir = openSync(dirname(path), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    const directory = fstatSync(dir);
    if ((directory.mode & 0o077) !== 0 || (process.getuid && directory.uid !== process.getuid())) {
      throw new Error('PRIVATE_DIRECTORY_REQUIRED');
    }
    const fd = openSync(
      `/proc/self/fd/${dir}/${basename(path)}`,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const file = fstatSync(fd);
      if (!file.isFile() || (file.mode & 0o077) !== 0 || (process.getuid && file.uid !== process.getuid())) {
        throw new Error('PRIVATE_FILE_REQUIRED');
      }
      const body = readFileSync(fd, 'utf8');
      const record: unknown = JSON.parse(body);
      // 重複キーや非canonical表現を受け入れず、保存関数が固定したbyte列だけを読む。
      if (canonicalJson(record) !== body) throw new Error('INVALID_REPAIR_RECORD');
      return record;
    } finally {
      closeSync(fd);
    }
  } finally {
    closeSync(dir);
  }
}
