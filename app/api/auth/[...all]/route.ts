import { toNextJsHandler } from 'better-auth/next-js';
import { getAuth } from '@/lib/auth';
import { d1Auth, isD1Runtime } from '@/server/d1-runtime';

export async function GET(req: Request) {
  if (isD1Runtime()) return d1Auth(req);
  return toNextJsHandler(await getAuth()).GET(req);
}

export async function POST(req: Request) {
  if (isD1Runtime()) return d1Auth(req);
  return toNextJsHandler(await getAuth()).POST(req);
}
