import type { NextAuthOptions } from 'next-auth';

import bcrypt from 'bcryptjs';
import CredentialsProvider from 'next-auth/providers/credentials';

import { prisma } from './prisma';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          throw new Error('ユーザー名とパスワードを入力してください');
        }

        const admin = await prisma.admin.findUnique({
          where: { username: credentials.username },
        });

        if (!admin) {
          throw new Error('ユーザー名またはパスワードが正しくありません');
        }

        const isValidPassword = await bcrypt.compare(credentials.password, admin.password);

        if (!isValidPassword) {
          throw new Error('ユーザー名またはパスワードが正しくありません');
        }

        return {
          id: admin.id,
          name: admin.username,
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
