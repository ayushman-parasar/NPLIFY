import Link from "next/link";
import { redirect } from "next/navigation";
import erd from "@data/erd.v5.json";
import ErdMap from "@/components/ErdMap";
import Brand from "@/components/Brand";
import ThemeToggle from "@/components/ThemeToggle";
import { authDisabled, currentViewer, signOut } from "@/lib/auth";

export const dynamic = "force-dynamic";

const entities = Object.values(erd.E as Record<string, { d: string }>);
const tables = entities.filter((e) => e.d !== "view").length;
const views = entities.length - tables;

export default async function Page() {
  const viewer = await currentViewer();
  if (!viewer) redirect("/login");
  const flaggingEnabled = process.env.NEXT_PUBLIC_FLAGGING_ENABLED === "true";
  const initial = viewer.email.slice(0, 2).toUpperCase();

  return (
    <div className="erd-page">
      <div className="topbar">
        <Brand sub={viewer.isVisitor ? `P0 data model · ${tables} tables + ${views} views` : `P0 data model · draft v${erd.version} · ${tables} tables + ${views} views`} />
        {!viewer.isVisitor && (
          <span className="pill" title="Knowledge base version used by the assistant">
            <i /> ERD v{erd.version}
          </span>
        )}
        <span className="grow" />
        <div className="acct">
          <span className="who" title={viewer.email}>
            <span className="avatar" aria-hidden="true">
              {initial}
            </span>
            <span>{viewer.email}</span>
          </span>
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
          <ThemeToggle />
        </div>
      </div>
      <ErdMap config={{ flaggingEnabled: flaggingEnabled && !viewer.isVisitor, visitor: viewer.isVisitor }} />
    </div>
  );
}
