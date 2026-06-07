import type { VercelRequest, VercelResponse } from '@vercel/node';

import { fetchFile } from '../_lib/github';
import { verifySession } from '../_lib/session';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');

  if (!verifySession(req.headers['cookie'])) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const path = req.query['path'];
  if (typeof path !== 'string' || !path) {
    res.status(400).json({ error: 'Missing path parameter' });
    return;
  }

  if (path.includes('..') || path.startsWith('/') || path.includes('\0')) {
    res.status(400).json({ error: 'Invalid path' });
    return;
  }

  // Allow only root-level .md files (no directories, no traversal)
  if (!/^[\w.-]+\.md$/u.test(path)) {
    res.status(400).json({ error: 'Invalid path' });
    return;
  }

  try {
    const content = await fetchFile(path);
    res.status(200).json(content);
  } catch (err) {
    console.error('fetchFile error:', err);
    res.status(500).json({ error: 'Failed to fetch content' });
  }
}
