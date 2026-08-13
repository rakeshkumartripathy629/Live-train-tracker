import NextAuth, { type NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { MongoDBAdapter } from '@auth/mongodb-adapter';
import bcrypt from 'bcryptjs';
import clientPromise from '@/lib/mongodb';

export const authOptions: NextAuthOptions = {
  adapter: MongoDBAdapter(clientPromise),
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  secret: process.env.NEXTAUTH_SECRET,
  pages: { signIn: '/login' },
  providers: [
    CredentialsProvider({
      name: 'Email & Password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const client = await clientPromise;
        const users = client.db().collection('users');
        const user = await users.findOne({ email: credentials.email.toLowerCase() });
        if (!user || typeof user.password !== 'string') return null;

        const valid = await bcrypt.compare(credentials.password, user.password);
        if (!valid) return null;

        return {
          id: (user._id as { toString(): string }).toString(),
          email: user.email as string,
          name: (user.name as string) || null,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      // Record the session in MongoDB (sessions collection)
      try {
        const client = await clientPromise;
        await client.db().collection('sessions').insertOne({
          userId: user.id,
          email: user.email,
          sessionToken: crypto.randomUUID(),
          type: 'credentials',
          expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } catch (err) {
        console.error('[auth] failed to record session:', err);
      }
      return true;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.sub as string) || '';
      }
      return session;
    },
  },
};

export default NextAuth(authOptions);
