import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { verifyPassword } from "@/lib/password";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: Role } & DefaultSession["user"];
  }
}

/** admin: NPL/New XP staff with the activity log; user: NPL staff; visitor: client guests, who see the model
 *  without the review apparatus (no open questions, no draft or version labels, no activity log). */
export type Role = "admin" | "user" | "visitor";
export const ROLES: Role[] = ["admin", "user", "visitor"];
export const asRole = (r: unknown): Role => (ROLES.includes(r as Role) ? (r as Role) : "user");

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
      session.user.role = asRole(token.role);
      return session;
    },
  },
});

export type Viewer = { id: string; email: string; role: Role; isAdmin: boolean; isVisitor: boolean };

const viewerOf = (id: string, email: string, role: Role): Viewer => ({ id, email, role, isAdmin: role === "admin", isVisitor: role === "visitor" });

/** The signed-in viewer, or null. In local dev with AUTH_DISABLED a fixed viewer is returned; its role comes
 *  from AUTH_DEV_ROLE or a `dev-role` cookie (admin by default) so every role can be previewed without a database. */
export async function currentViewer(): Promise<Viewer | null> {
  if (authDisabled) {
    const { cookies } = await import("next/headers");
    const fromCookie = (await cookies()).get("dev-role")?.value;
    return viewerOf("dev-user", "dev@localhost", asRole(fromCookie ?? process.env.AUTH_DEV_ROLE ?? "admin"));
  }
  const session = await auth();
  if (!session?.user?.email || !session.user.id) return null;
  return viewerOf(session.user.id, session.user.email, session.user.role);
}
