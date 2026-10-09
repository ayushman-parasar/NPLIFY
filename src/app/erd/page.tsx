import { redirect } from "next/navigation";
import erd from "@data/erd.v5.json";
import ErdMap from "@/components/ErdMap";
import TopBar from "@/components/TopBar";
import { currentViewer } from "@/lib/auth";

export const dynamic = "force-dynamic";

const entities = Object.values(erd.E as Record<string, { d: string }>);
const tables = entities.filter((e) => e.d !== "view").length;
const views = entities.length - tables;

export default async function ErdPage() {
  const viewer = await currentViewer();
  if (!viewer) redirect("/login");
  const flaggingEnabled = process.env.NEXT_PUBLIC_FLAGGING_ENABLED === "true";

  return (
    <div className="erd-page">
      <TopBar
        viewer={viewer}
        active="erd"
        sub={viewer.isVisitor ? `P0 data model · ${tables} tables + ${views} views` : `P0 data model · draft v${erd.version} · ${tables} tables + ${views} views`}
        pill={viewer.isVisitor ? undefined : `ERD v${erd.version}`}
      />
      <ErdMap config={{ flaggingEnabled: flaggingEnabled && !viewer.isVisitor, visitor: viewer.isVisitor }} />
    </div>
  );
}
