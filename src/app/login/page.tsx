import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import erd from "@data/erd.v5.json";
import Brand from "@/components/Brand";
import LoginArt from "@/components/LoginArt";
import { currentViewer, signIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

const entities = Object.values(erd.E as Record<string, { d: string }>);
const tables = entities.filter((e) => e.d !== "view").length;
const links = (erd.R as unknown[]).length;
const decisions = 38; // D1–D38, the review decision record the assistant answers from

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentViewer()) redirect("/");
  const { error } = await searchParams;

  return (
    <main className="auth">
      <div className="grid" aria-hidden="true" />
      <div className="blob b1" aria-hidden="true" />
      <div className="blob b2" aria-hidden="true" />
      <div className="blob b3" aria-hidden="true" />
      <LoginArt />

      <div className="card">
        <Brand sub={`P0 data model · draft v${erd.version}`} />
        <h1>Sign in</h1>
        <p className="lead">The interactive data model and its assistant, for NPL staff.</p>

        <div className="stats" aria-label="What is inside">
          <div>
            <b data-count={tables}>{tables}</b>
            <span>tables</span>
          </div>
          <div>
            <b data-count={links}>{links}</b>
            <span>links</span>
          </div>
          <div>
            <b data-count={decisions}>{decisions}</b>
            <span>decisions</span>
          </div>
        </div>

        <form
          action={async (formData) => {
            "use server";
            try {
              await signIn("credentials", {
                email: String(formData.get("email") ?? ""),
                password: String(formData.get("password") ?? ""),
                redirectTo: "/",
              });
            } catch (err) {
              if (err instanceof AuthError) redirect("/login?error=1");
              throw err; // the successful sign-in redirect is thrown too, and must pass through
            }
          }}
        >
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required autoComplete="username" placeholder="you@npl.example" />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" required autoComplete="current-password" placeholder="••••••••" />
          </div>
          <button className="btn primary" type="submit">
            Sign in
          </button>
          {error && <p className="err">Invalid email or password.</p>}
          <p className="fine">
            Access is limited to accounts New XP has created for NPL staff. Your questions to the assistant and your use of the map are
            recorded for New XP’s review.
          </p>
        </form>
      </div>
    </main>
  );
}
