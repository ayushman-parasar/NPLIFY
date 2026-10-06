import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { verifyPassword } from "@/lib/password";

declare module "next-auth" {
  interface Session {
    user: { id: string; isAdmin: boolean } & DefaultSession["user"];
  }
}

/** Local development escape hatch. Never honoured in production builds. */
export const authDisabled =
  process.env.NODE_ENV !== "production" && process.env.AUTH_DISABLED === "true";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Credentials sign-in requires JWT sessions in Auth.js; users are seeded rows in the user table.
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  providers: [
    Credentials({
      credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;
        const db = getDb();
        if (!db) return null;
        const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
        if (!user || !user.active || !verifyPassword(password, user.passwordHash)) return null;
        return { id: user.id, email: user.email, name: user.name ?? user.email, role: user.role } as { id: string; email: string; name: string; role: string };
      },
    }),
  ],
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.role = (user as { role?: string }).role ?? "user";
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub ?? "";
      session.user.isAdmin = token.role === "admin";
      return session;
    },
  },
});

export type Viewer = { id: string; email: string; isAdmin: boolean };

/** The signed-in viewer, or null. In local dev with AUTH_DISABLED a fixed viewer is returned. */
export async function currentViewer(): Promise<Viewer | null> {
  if (authDisabled) return { id: "dev-user", email: "dev@localhost", isAdmin: true };
  const session = await auth();
  if (!session?.user?.email || !session.user.id) return null;
  return { id: session.user.id, email: session.user.email, isAdmin: session.user.isAdmin };
}
