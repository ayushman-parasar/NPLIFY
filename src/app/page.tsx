import Link from "next/link";
import { redirect } from "next/navigation";
import ErdMap from "@/components/ErdMap";
import { authDisabled, currentViewer, signOut } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Page() {
  const viewer = await currentViewer();
  if (!viewer) redirect("/login");
  const flaggingEnabled = process.env.NEXT_PUBLIC_FLAGGING_ENABLED === "true";

  return (
    <div className="erd-page">
      <div className="acct">
        <span>Signed in as {viewer.email}</span>
        {viewer.isAdmin && <Link href="/admin">Activity log</Link>}
        {!authDisabled && (
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button type="submit">Sign out</button>
          </form>
        )}
      </div>
      <ErdMap config={{ flaggingEnabled }} />
    </div>
  );
}
