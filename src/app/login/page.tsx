import { redirect } from "next/navigation";
import { currentViewer, signIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  if (await currentViewer()) redirect("/");
  const { sent, error } = await searchParams;

  return (
    <main style={{ maxWidth: 420, margin: "12vh auto", padding: "0 16px", fontFamily: "var(--font-ui)" }}>
      <h1 style={{ fontSize: 20, margin: "0 0 4px" }}>NPLify ERD</h1>
      <p style={{ color: "var(--muted)", margin: "0 0 20px" }}>Interactive data model and assistant for NPL staff.</p>

      {sent ? (
        <p>Check your email for a sign-in link. It is valid for 24 hours and works once.</p>
      ) : (
        <form
          action={async (formData) => {
            "use server";
            const email = String(formData.get("email") ?? "").trim();
            await signIn("resend", { email, redirectTo: "/" });
          }}
          style={{ display: "grid", gap: 10 }}
        >
          <label htmlFor="email" style={{ fontSize: 13 }}>
            Work email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@npl.example"
            style={{ padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 4, font: "inherit" }}
          />
          <button className="btn primary" type="submit" style={{ padding: "8px 12px" }}>
            Email me a sign-in link
          </button>
          {error && (
            <p style={{ color: "var(--hi)", margin: 0, fontSize: 13 }}>
              {error === "AccessDenied"
                ? "This address is not on the access list. Ask New XP to add it."
                : "Sign-in failed. Try again or ask New XP for help."}
            </p>
          )}
          <p style={{ color: "var(--muted)", fontSize: 12, margin: "8px 0 0" }}>
            Access is limited to invited NPL staff. Your questions to the assistant and your use of the map are recorded for New XP’s
            review.
          </p>
        </form>
      )}
    </main>
  );
}
