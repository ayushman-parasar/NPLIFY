import NextAuth, { type DefaultSession } from "next-auth";
import Resend from "next-auth/providers/resend";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getDb, schema } from "@/lib/db";

declare module "next-auth" {
  interface Session {
    user: { id: string; isAdmin: boolean } & DefaultSession["user"];
  }
}

function list(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** True when the address is on ALLOWED_EMAILS, either exactly or by domain (@example.com). */
export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  const domain = e.slice(e.indexOf("@"));
  return list("ALLOWED_EMAILS").some((entry) => entry === e || (entry.startsWith("@") && entry === domain));
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && list("ADMIN_EMAILS").includes(email.toLowerCase());
}

/** Local development escape hatch. Never honoured in production builds. */
export const authDisabled =
  process.env.NODE_ENV !== "production" && process.env.AUTH_DISABLED === "true";

const db = getDb();

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: db ? DrizzleAdapter(db, {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  }) : undefined,
  session: { strategy: db ? "database" : "jwt" },
  providers: [
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: process.env.AUTH_EMAIL_FROM,
    }),
  ],
  pages: { signIn: "/login", verifyRequest: "/login?sent=1", error: "/login" },
  callbacks: {
    // The allowlist is the access control: nobody else receives a sign-in link.
    signIn({ user }) {
      return isAllowedEmail(user.email);
    },
    session({ session, user }) {
      session.user.id = user.id;
      session.user.isAdmin = isAdminEmail(user.email);
      return session;
    },
  },
});

export type Viewer = { id: string; email: string; isAdmin: boolean };

/** The signed-in viewer, or null. In local dev with AUTH_DISABLED a fixed viewer is returned. */
export async function currentViewer(): Promise<Viewer | null> {
  if (authDisabled) return { id: "dev-user", email: "dev@localhost", isAdmin: true };
  const session = await auth();
  if (!session?.user?.email) return null;
  return { id: session.user.id, email: session.user.email, isAdmin: session.user.isAdmin };
}
