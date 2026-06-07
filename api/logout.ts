import type { VercelRequest, VercelResponse } from '@vercel/node';

import { clearSessionCookie } from './_lib/session';

export default function handler(_req: VercelRequest, res: VercelResponse): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Set-Cookie', clearSessionCookie());
  res.status(200).json({ ok: true });
}
