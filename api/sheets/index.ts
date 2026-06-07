import type { VercelRequest, VercelResponse } from '@vercel/node';

import { listSheets } from '../_lib/github';
import { verifySession } from '../_lib/session';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');

  if (!verifySession(req.headers['cookie'])) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const sheets = await listSheets();
    res.status(200).json(sheets);
  } catch (err) {
    console.error('listSheets error:', err);
    res.status(500).json({ error: 'Failed to fetch sheets' });
  }
}
