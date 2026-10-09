import Link from "next/link";
import Brand from "@/components/Brand";
import ThemeToggle from "@/components/ThemeToggle";
import { authDisabled, signOut, type Viewer } from "@/lib/auth";

export type Section = "home" | "erd" | "scenarios" | "documents" | "admin";

const NAV: { id: Section; href: string; label: string }[] = [
  { id: "home", href: "/", label: "Home" },
  { id: "erd", href: "/erd", label: "Interactive ERD" },
  { id: "scenarios", href: "/scenarios", label: "Scenarios" },
  { id: "documents", href: "/documents", label: "Documents" },
];

/** The sticky brand bar: logo, section navigation, account and theme switch. Server component. */
export default function TopBar({ viewer, active, sub, pill }: { viewer: Viewer; active: Section; sub?: string; pill?: string }) {
  const initial = viewer.email.slice(0, 2).toUpperCase();
  return (
    <div className="topbar">
      <Link href="/" className="brandlink">
        <Brand sub={sub} />
      </Link>
      {pill && (
        <span className="pill" title="Knowledge base version used by the assistant">
          <i /> {pill}
        </span>
      )}
      <nav className="nav" aria-label="Sections">
        {NAV.map((n) => (
          <Link key={n.id} href={n.href} className={n.id === active ? "on" : undefined} aria-current={n.id === active ? "page" : undefined}>
            {n.label}
          </Link>
        ))}
        {viewer.isAdmin && (
          <Link href="/admin" className={active === "admin" ? "on" : undefined} aria-current={active === "admin" ? "page" : undefined}>
            Activity log
          </Link>
        )}
      </nav>
      <span className="grow" />
      <div className="acct">
        <span className="who" title={viewer.email}>
          <span className="avatar" aria-hidden="true">
            {initial}
          </span>
          <span>{viewer.email}</span>
        </span>
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
  );
}
