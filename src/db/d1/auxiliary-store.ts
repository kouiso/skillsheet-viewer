import type { D1Binding } from './binding';
import type { AuxiliaryOperation } from './contract';
import { d1Timestamp } from './value';

const MAX = 8,
  WINDOW = 10 * 60_000,
  LOCK = 15 * 60_000;

/** clock は Worker 側で確定する。クライアント指定の未来日時でロック解除させない。 */
export async function executeD1Auxiliary(db: D1Binding, owner: string, request: AuxiliaryOperation, now = Date.now()) {
  const query = (sql: string, ...params: (string | number | null)[]) =>
    db
      .prepare(sql)
      .bind(...params)
      .all();
  switch (request.operation) {
    case 'drive.read': {
      const result = await query(
        'SELECT folder_id AS folderId,folder_name_at_selection AS folderName FROM drive_destination WHERE owner_id=?',
        owner,
      );
      return result.results[0] ?? null;
    }
    case 'drive.save':
      await query(
        `INSERT INTO drive_destination(owner_id,folder_id,folder_name_at_selection,updated_at) VALUES(?,?,?,?)
        ON CONFLICT(owner_id) DO UPDATE SET folder_id=excluded.folder_id,
        folder_name_at_selection=excluded.folder_name_at_selection,updated_at=excluded.updated_at`,
        owner,
        request.folderId,
        request.folderName,
        d1Timestamp(new Date(now)),
      );
      return null;
    case 'drive.clear':
      await query('DELETE FROM drive_destination WHERE owner_id=?', owner);
      return null;
    case 'viewer.clear':
      await query('DELETE FROM viewer_login_attempt WHERE key=?', request.key);
      return null;
    case 'viewer.purge':
      await query(
        `DELETE FROM viewer_login_attempt WHERE window_started_at<?
        AND (locked_until IS NULL OR locked_until<=?)`,
        d1Timestamp(new Date(now - WINDOW)),
        d1Timestamp(new Date(now)),
      );
      return null;
    case 'viewer.reserve':
    case 'viewer.check': {
      const nowIso = d1Timestamp(new Date(now));
      const locked = '(locked_until IS NOT NULL AND locked_until>?2)';
      const expired = `(window_started_at<?3 AND NOT ${locked})`;
      const next = `(CASE WHEN ${locked} THEN failure_count WHEN ${expired} THEN 1 ELSE failure_count+1 END)`;
      const result =
        request.operation === 'viewer.reserve'
          ? await query(
              `INSERT INTO viewer_login_attempt(key,failure_count,window_started_at,locked_until) VALUES(?1,1,?2,NULL)
          ON CONFLICT(key) DO UPDATE SET failure_count=${next},
          window_started_at=CASE WHEN ${expired} THEN ?2 ELSE window_started_at END,
          locked_until=CASE WHEN ${locked} THEN locked_until WHEN ${next}>${MAX} THEN ?4 ELSE locked_until END
          RETURNING failure_count,window_started_at,locked_until`,
              request.key,
              nowIso,
              d1Timestamp(new Date(now - WINDOW)),
              d1Timestamp(new Date(now + LOCK)),
            )
          : await query(
              'SELECT failure_count,window_started_at,locked_until FROM viewer_login_attempt WHERE key=?',
              request.key,
            );
      const row = result.results[0];
      const until = row?.locked_until ? Date.parse(String(row.locked_until)) : 0;
      const count =
        !row || (until <= now && Date.parse(String(row.window_started_at)) < now - WINDOW)
          ? 0
          : Number(row.failure_count);
      const isLocked = until > now || count > MAX;
      return {
        locked: isLocked,
        retryAfterSeconds: isLocked ? Math.max(1, Math.ceil((until - now) / 1000)) : 0,
        remainingAttempts: isLocked ? 0 : Math.max(0, MAX - count),
      };
    }
  }
}
