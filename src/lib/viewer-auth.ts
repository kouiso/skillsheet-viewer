import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';

import { prisma } from './prisma';

const VIEWER_SESSION_COOKIE = 'viewer-session';

async function checkAuthCode(auth: { code: string }, code: string): Promise<boolean> {
  return bcrypt.compare(code, auth.code);
}

async function verifyCodeAgainstAuths(viewerAuths: { code: string }[], code: string): Promise<boolean> {
  for (const auth of viewerAuths) {
    const isValid = await checkAuthCode(auth, code);
    if (isValid) {
      return true;
    }
  }
  return false;
}

export async function verifyViewerCode(code: string): Promise<boolean> {
  try {
    const viewerAuths = await prisma.viewerAuth.findMany();
    return verifyCodeAgainstAuths(viewerAuths, code);
  } catch (error) {
    console.error('Error verifying viewer code:', error);
    return false;
  }
}

export async function setViewerSession() {
  (await cookies()).set(VIEWER_SESSION_COOKIE, 'authenticated', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

export async function getViewerSession(): Promise<boolean> {
  const session = (await cookies()).get(VIEWER_SESSION_COOKIE);
  return session?.value === 'authenticated';
}

export async function clearViewerSession() {
  (await cookies()).delete(VIEWER_SESSION_COOKIE);
}
