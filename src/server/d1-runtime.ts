import 'server-only';
import { headers } from 'next/headers';
import { getDb } from '@/db';
import type { AuxiliaryOperation } from '../db/d1/contract';
import type { DocumentConnection } from '../db/document-operation';
import { DocumentError } from '../db/document-service';
import { createD1Transport } from './d1-transport';

export function isD1Runtime() {
  const backend = process.env.SKILLSHEET_DB_BACKEND;
  if (backend && backend !== 'neon' && backend !== 'd1') throw new DocumentError('INVALID_GATEWAY_CONFIG');
  return backend === 'd1';
}

function transport() {
  const endpoint = process.env.D1_GATEWAY_URL;
  const serviceToken = process.env.D1_GATEWAY_SERVICE_TOKEN;
  const appOrigin = process.env.BETTER_AUTH_URL;
  if (!endpoint || !serviceToken || !appOrigin) throw new DocumentError('INVALID_GATEWAY_CONFIG');
  return createD1Transport({ endpoint, serviceToken, appOrigin: new URL(appOrigin).origin });
}

/** Neon互換経路を残し、D1選択時にNeonへfallbackしない。 */
export function getDocumentDb(): DocumentConnection {
  if (!isD1Runtime()) return getDb();
  return {
    async documentOperation(request, expectedOwner) {
      if (!expectedOwner || expectedOwner !== process.env.SKILLSHEET_OWNER_ID) throw new DocumentError('ACCESS_DENIED');
      return transport().operation(request, new Headers(await headers()));
    },
  };
}

export async function d1Auxiliary(request: AuxiliaryOperation, requestHeaders?: Headers) {
  return transport().operation(request, requestHeaders ?? new Headers(await headers()));
}
export async function d1OwnerAuxiliary(owner: string, request: AuxiliaryOperation) {
  if (!owner || owner !== process.env.SKILLSHEET_OWNER_ID) throw new DocumentError('ACCESS_DENIED');
  return d1Auxiliary(request);
}
export async function d1Auth(request: Request): Promise<Response> {
  return transport().auth(request);
}

export async function getD1EditorUserId(requestHeaders: Headers): Promise<string | null> {
  const origin = process.env.BETTER_AUTH_URL;
  if (!origin) return null;
  const response = await d1Auth(
    new Request(new URL('/api/auth/get-session?disableCookieCache=true', origin), { headers: requestHeaders }),
  );
  if (!response.ok) return null;
  const session: unknown = await response.json();
  if (
    session === null ||
    typeof session !== 'object' ||
    !('user' in session) ||
    !session.user ||
    typeof session.user !== 'object'
  )
    return null;
  return 'id' in session.user && typeof session.user.id === 'string' ? session.user.id : null;
}
