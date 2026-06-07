import { timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import type { VercelRequest, VercelResponse } from '@vercel/node';

import { createSessionCookie } from './_lib/session';

export default function handler(req: VercelRequest, res: VercelResponse): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const origin = req.headers['origin'];
  const host = req.headers['host'];
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
    } catch {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
  }

  const viewerCode = process.env['VIEWER_CODE'];
  if (!viewerCode) {
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  let code: string;
  try {
    const body = req.body as { code?: unknown };
    if (typeof body?.code !== 'string') {
      res.status(400).json({ error: 'Invalid request body' });
      return;
    }
    code = body.code;
  } catch {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  if (code.length !== viewerCode.length) {
    res.status(401).json({ error: 'Invalid code' });
    return;
  }

  const codeBuffer = Buffer.from(code, 'utf-8');
  const validBuffer = Buffer.from(viewerCode, 'utf-8');

  if (!timingSafeEqual(codeBuffer, validBuffer)) {
    res.status(401).json({ error: 'Invalid code' });
    return;
  }

  res.setHeader('Set-Cookie', createSessionCookie());
  res.status(200).json({ ok: true });
}
