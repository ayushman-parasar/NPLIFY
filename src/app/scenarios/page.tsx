import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import erd from "@data/erd.v5.json";
import TopBar from "@/components/TopBar";
import { currentViewer } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Project = { client: string; projects: string; lead: string; scenarios: string[][] };
type Catalogue = { intro: string; projects: Project[]; flows: string[][]; answered_questions: string[][] };
type ReviewScenario = { id: string; name: string; story: string; verdict: string; ents: string[] };
const cat = erd.SCENARIO_CATALOGUE as Catalogue;
const review = erd.SCENARIOS as ReviewScenario[];
const reviewV4 = erd.SCENARIO_V4 as Record<string, string>;
const walks = erd.WALKS as { name: string; steps: string[][] }[];
const ENT = new RegExp("\\b(" + Object.keys(erd.E).sort((a, b) => b.length - a.length).join("|") + ")\\b", "g");
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/** Turns entity names in a line into links that pin them on the map. */
function withEntities(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(ENT)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    out.push(
      <Link key={m.index} href={`/erd?entity=${encodeURIComponent(m[0])}`} className="entlink">
        {m[0]}
      </Link>,
    );
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const ask = (q: string) => `/erd?tab=ask&ask=${encodeURIComponent(q)}`;

export default async function ScenariosPage() {
  const viewer = await currentViewer();
  if (!viewer) redirect("/login");
  const total = cat.projects.reduce((n, p) => n + p.scenarios.length, 0);
  const intro = viewer.isVisitor
    ? "Every scenario NPL runs today, grouped by client and project. The operational flows they share are defined once (F1–F10) and referenced by number."
    : cat.intro;

  return (
    <>
      <TopBar viewer={viewer} active="scenarios" sub="Scenario catalogue" />
      <main className="site sc">
        <header className="pagehead">
          <p className="kicker">Scenarios</p>
          <h1>How NPL&apos;s business runs through the model</h1>
          <p className="lead">{intro}</p>
          <div className="pills">
            <span className="st answered">{total} scenarios</span>
            <span className="st gap">{cat.projects.length} client groups</span>
            <span className="st pending">{cat.flows.length} shared flows</span>
            <span className="st">{walks.length} guided walkthroughs</span>
          </div>
        </header>

        <div className="sc-layout">
          <aside className="sc-index">
            <b>Clients</b>
            {cat.projects.map((p) => (
              <a key={p.client} href={`#${slug(p.client)}`}>
                {p.client}
              </a>
            ))}
            <b>More</b>
            <a href="#flows">Shared flows</a>
            <a href="#walks">Walkthroughs</a>
            {!viewer.isVisitor && <a href="#review">Review scenarios</a>}
            {!viewer.isVisitor && <a href="#answers">NPL&apos;s answers</a>}
          </aside>

          <div className="sc-body">
            {cat.projects.map((p, pi) => (
              <section key={p.client} id={slug(p.client)} className="client" style={{ animationDelay: `${pi * 60}ms` }}>
                <div className="client-h">
                  <h2>{p.client}</h2>
                  <p className="proj">{withEntities(p.projects)}</p>
                  <p className="lead">{p.lead}</p>
                </div>
                <div className="scns">
                  {p.scenarios.map(([name, story, mech, tables], i) => (
                    <details key={i} className="scn">
                      <summary>
                        <span className="num">{pi + 1}.{i + 1}</span>
                        <span className="name">{name}</span>
                      </summary>
                      <div className="scn-body">
                        <p>{story}</p>
                        {mech && (
                          <p className="mech">
                            <b>Fee and flow</b> {withEntities(mech)}
                          </p>
                        )}
                        {tables && (
                          <p className="tables">
                            <b>In the model</b> {withEntities(tables)}
                          </p>
                        )}
                        <Link href={ask(`${p.client}: ${name}. Walk me through this scenario end to end and name the tables involved.`)} className="askl">
                          Ask the ERD about this ↗
                        </Link>
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            ))}

            <section id="flows" className="flows">
              <h2>Shared operational flows</h2>
              <p className="lead">Defined once and referenced by number from the scenarios above.</p>
              <div className="flowgrid">
                {cat.flows.map(([id, name, desc, tables]) => (
                  <article key={id} className="flow">
                    <span className="fid">{id}</span>
                    <h3>{name}</h3>
                    <p>{desc}</p>
                    {tables && <p className="tables">{withEntities(tables)}</p>}
                    <Link href={ask(`Flow ${id}: ${name}. Which tables carry it, step by step?`)} className="askl">
                      Ask the ERD ↗
                    </Link>
                  </article>
                ))}
              </div>
            </section>

            <section id="walks" className="walks">
              <h2>Guided walkthroughs on the map</h2>
              <p className="lead">Each one lights up the path a deal takes, one entity at a time.</p>
              <ol className="walklist">
                {walks.map((w, i) => (
                  <li key={w.name}>
                    <Link href={`/erd?walk=${i}`}>
                      <span className="name">{w.name}</span>
                      <span className="meta">{w.steps.length} steps</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>

            {!viewer.isVisitor && (
              <section id="review" className="review">
                <h2>Edge-case scenarios from the review</h2>
                <p className="lead">Traced step by step against ERD v3.0 in the review of 6–7 October 2026, and how the current draft resolves each.</p>
                {review.map((s) => (
                  <details key={s.id} className="scn">
                    <summary>
                      <span className="num">{s.id}</span>
                      <span className="name">{s.name}</span>
                    </summary>
                    <div className="scn-body">
                      <p>{s.story}</p>
                      <p className="mech">
                        <b>v3.0 verdict</b> {s.verdict}
                      </p>
                      <p className="tables">
                        <b>Resolved in v4.0</b> {withEntities(reviewV4[s.id] ?? "")}
                      </p>
                      <Link href={ask(`Scenario ${s.id}: ${s.name}. Why did ERD v3.0 fail it, step by step, and how does the current draft handle it?`)} className="askl">
                        Ask the ERD about this ↗
                      </Link>
                    </div>
                  </details>
                ))}
              </section>
            )}

            {!viewer.isVisitor && cat.answered_questions.length > 0 && (
              <section id="answers" className="answers">
                <h2>NPL&apos;s answers to the operational questions</h2>
                <dl>
                  {cat.answered_questions.map(([q, a]) => (
                    <div key={q}>
                      <dt>{q}</dt>
                      <dd>{withEntities(a)}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
