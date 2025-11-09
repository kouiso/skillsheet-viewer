import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';

import { prisma } from './prisma';

const VIEWER_SESSION_COOKIE = 'viewer-session';

export async function verifyViewerCode(code: string): Promise<boolean> {
  try {
    const viewerAuths = await prisma.viewerAuth.findMany();

    for (const auth of viewerAuths) {
      const isValid = await bcrypt.compare(code, auth.code);
      if (isValid) {
        return true;
      }
    }

    return false;
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
