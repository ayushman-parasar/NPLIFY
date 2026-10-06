import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { currentViewer, signIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

const input: React.CSSProperties = { padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 4, font: "inherit", width: "100%" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentViewer()) redirect("/");
  const { error } = await searchParams;

  return (
    <main style={{ maxWidth: 400, margin: "12vh auto", padding: "0 16px", fontFamily: "var(--font-ui)" }}>
      <h1 style={{ fontSize: 20, margin: "0 0 4px" }}>NPLify ERD</h1>
      <p style={{ color: "var(--muted)", margin: "0 0 20px" }}>Interactive data model and assistant for NPL staff.</p>

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
        style={{ display: "grid", gap: 10 }}
      >
        <label htmlFor="email" style={{ fontSize: 13 }}>
          Email
        </label>
        <input id="email" name="email" type="email" required autoComplete="username" style={input} />
        <label htmlFor="password" style={{ fontSize: 13 }}>
          Password
        </label>
        <input id="password" name="password" type="password" required autoComplete="current-password" style={input} />
        <button className="btn primary" type="submit" style={{ padding: "8px 12px" }}>
          Sign in
        </button>
        {error && (
          <p style={{ color: "var(--hi)", margin: 0, fontSize: 13 }}>Invalid email or password.</p>
        )}
        <p style={{ color: "var(--muted)", fontSize: 12, margin: "8px 0 0" }}>
          Access is limited to accounts New XP has created for NPL staff. Your questions to the assistant and your use of the map
          are recorded for New XP’s review.
        </p>
      </form>
    </main>
  );
}
