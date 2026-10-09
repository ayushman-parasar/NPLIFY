import Link from "next/link";
import { redirect } from "next/navigation";
import erd from "@data/erd.v5.json";
import LoginArt from "@/components/LoginArt";
import TopBar from "@/components/TopBar";
import { currentViewer } from "@/lib/auth";
import { visibleDocs } from "@/lib/documents";

export const dynamic = "force-dynamic";

const entities = Object.values(erd.E as Record<string, { d: string }>);
const tables = entities.filter((e) => e.d !== "view").length;
const views = entities.length - tables;
const links = (erd.R as unknown[]).length;
const walks = (erd.WALKS as unknown[]).length;
const catalogue = erd.SCENARIO_CATALOGUE as { projects: { scenarios: unknown[] }[]; flows: unknown[] };
const scenarioCount = catalogue.projects.reduce((n, p) => n + p.scenarios.length, 0);

const I = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: d }} />
);
const ICON = {
  map: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><path d="M10 6.5h4M17.5 10v4M6.5 10v4a3 3 0 0 0 3 3H14"/>',
  route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
  docs: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h8M8 17h8M8 9h2"/>',
  chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
};

export default async function HomePage() {
  const viewer = await currentViewer();
  if (!viewer) redirect("/login");
  const docs = visibleDocs(viewer.isVisitor);

  return (
    <>
      <TopBar viewer={viewer} active="home" sub="P0 data model" />
      <main className="home">
        <section className="hero">
          <div className="grid" aria-hidden="true" />
          <div className="blob b1" aria-hidden="true" />
          <div className="blob b2" aria-hidden="true" />
          <LoginArt />
          <div className="hero-in">
            <p className="kicker">NPLify · P0 technical baseline</p>
            <h1>
              One data model for every deal,
              <br />
              from quote to confirmation.
            </h1>
            <p className="lead">
              Explore the entities and the links between them, follow the operational scenarios NPL runs today, and read the design
              documents that specify how the platform behaves.
            </p>
            <div className="cta">
              <Link href="/erd" className="btn primary">
                Open the interactive ERD {I(ICON.arrow)}
              </Link>
              <Link href="/erd?tab=ask" className="btn glass">
                {I(ICON.chat)} Ask the ERD
              </Link>
            </div>
            <div className="stats">
              <div>
                <b>{tables}</b>
                <span>tables</span>
              </div>
              <div>
                <b>{views}</b>
                <span>derived views</span>
              </div>
              <div>
                <b>{links}</b>
                <span>links</span>
              </div>
              <div>
                <b>{scenarioCount}</b>
                <span>scenarios</span>
              </div>
              <div>
                <b>{docs.length}</b>
                <span>documents</span>
              </div>
            </div>
          </div>
        </section>

        <section className="site">
          <div className="cards">
            <Link href="/erd" className="card c1">
              <i>{I(ICON.map)}</i>
              <h2>Interactive ERD</h2>
              <p>
                The whole model on one pannable canvas. Hover an entity to see what feeds it and what it feeds, trace data downstream,
                or walk one of {walks} guided data flows step by step.
              </p>
              <span className="go">Open the map {I(ICON.arrow)}</span>
            </Link>
            <Link href="/scenarios" className="card c2">
              <i>{I(ICON.route)}</i>
              <h2>Scenarios</h2>
              <p>
                {scenarioCount} scenarios across NPL&apos;s clients and projects, the {catalogue.flows.length} shared operational flows they
                use, and the tables that carry each one. Every scenario can be asked about on the map.
              </p>
              <span className="go">Browse scenarios {I(ICON.arrow)}</span>
            </Link>
            <Link href="/documents" className="card c3">
              <i>{I(ICON.docs)}</i>
              <h2>Documents</h2>
              <p>
                The document pack: the ERD and its reading guide, the ledger posting design, lifecycle and approvals, roles and
                visibility, the calculation specification and the configuration schema.
              </p>
              <span className="go">See the pack {I(ICON.arrow)}</span>
            </Link>
          </div>

          <div className="assist">
            <div>
              <h3>{I(ICON.chat)} Ask the ERD</h3>
              <p>
                An assistant that answers only from the model and its supporting documents, and points to the entities it used on the
                map. Try &ldquo;How does money flow from a collection to the receiver&apos;s confirmation?&rdquo;
              </p>
            </div>
            <Link href="/erd?tab=ask" className="btn">
              Start a conversation {I(ICON.arrow)}
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
