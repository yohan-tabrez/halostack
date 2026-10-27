import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { eq, sql } from 'drizzle-orm'
import { getDb, users, sessions, type UserRole } from '@/lib/db'
import { audit } from '@/lib/audit'

declare module 'next-auth' {
  interface User {
    role: UserRole
    sessionVersion?: number
  }
  interface Session {
    user: {
      id: string
      email: string
      role: UserRole
    }
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    id: string
    role: UserRole
    sessionVersion?: number
  }
}

// Auth.js requires JWT for the Credentials provider. Session revocation uses
// users.session_version (and clears unused Auth.js sessions rows). Postgres
// adapter tables remain for potential future OAuth providers.
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined
        const password = credentials?.password as string | undefined
        if (!email || !password) return null

        const db = getDb()
        const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
        if (!user) {
          await audit({ action: 'auth.login.failure', outcome: 'failure', severity: 'alert', metadata: { email } })
          return null
        }

        const valid = await bcrypt.compare(password, user.passwordHash)
        if (!valid) {
          await audit({
            action: 'auth.login.failure',
            actorId: user.id,
            actorEmail: user.email,
            outcome: 'failure',
            severity: 'alert',
          })
          return null
        }

        await audit({ action: 'auth.login.success', actorId: user.id, actorEmail: user.email })
        return {
          id: user.id,
          email: user.email,
          role: user.role,
          sessionVersion: user.sessionVersion,
          emailVerified: null,
        }
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id!
        token.role = user.role
        token.sessionVersion = user.sessionVersion ?? 0
        return token
      }
      if (token.id) {
        try {
          const db = getDb()
          const [row] = await db
            .select({
              role: users.role,
              email: users.email,
              sessionVersion: users.sessionVersion,
            })
            .from(users)
            .where(eq(users.id, token.id as string))
            .limit(1)
          if (!row || row.sessionVersion !== (token.sessionVersion ?? 0)) {
            return { ...token, id: '', role: 'read_only' as UserRole }
          }
          token.role = row.role
          token.email = row.email
        } catch {
          // Keep previous token if DB briefly unavailable.
        }
      }
      return token
    },
    async session({ session, token }) {
      if (!token.id) {
        return { ...session, user: { id: '', email: '', role: 'read_only' as UserRole } }
      }
      return {
        ...session,
        user: {
          id: token.id as string,
          email: (token.email as string) ?? session.user?.email ?? '',
          role: token.role as UserRole,
        },
      }
    },
  },
  trustHost: true,
})

/** Bump session_version so existing JWTs for this user are rejected. */
export async function revokeUserSessions(userId: string): Promise<void> {
  const db = getDb()
  await db
    .update(users)
    .set({ sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(eq(users.id, userId))
  await db.delete(sessions).where(eq(sessions.userId, userId))
}
