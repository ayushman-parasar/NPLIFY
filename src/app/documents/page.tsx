import { redirect } from "next/navigation";
import TopBar from "@/components/TopBar";
import { currentViewer } from "@/lib/auth";
import { FORMAT_LABEL, GROUPS, visibleDocs, type DocFormat } from "@/lib/documents";

export const dynamic = "force-dynamic";

const ICON: Record<DocFormat, string> = {
  html: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h8M8 17h8M8 9h2"/>',
  pdf: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/>',
  xlsx: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  docx: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h8M8 17h5"/>',
  json: '<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1"/><path d="M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/>',
};
const I = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: d }} />
);
const ORDER: DocFormat[] = ["html", "pdf", "xlsx", "docx", "json"];

export default async function DocumentsPage() {
  const viewer = await currentViewer();
  if (!viewer) redirect("/login");
  const docs = visibleDocs(viewer.isVisitor);
  let n = 0;

  return (
    <>
      <TopBar viewer={viewer} active="documents" sub="Document pack" />
      <main className="site docs">
        <header className="pagehead">
          <p className="kicker">Documents</p>
          <h1>The P0 document pack</h1>
          <p className="lead">
            {docs.length} documents. Read them online, or download the PDF and office formats. Every one is derived from the same model you
            see on the interactive map.
          </p>
        </header>

        {GROUPS.map((g) => {
          const list = docs.filter((d) => d.group === g.id);
          if (!list.length) return null;
          return (
            <section key={g.id} className="docgroup">
              <h2>{g.title}</h2>
              <p className="lead">{g.blurb}</p>
              <div className="doclist">
                {list.map((d) => {
                  const primary = ORDER.find((f) => d.files[f])!;
                  return (
                    <article key={d.slug} className="doc" style={{ animationDelay: `${n++ * 50}ms` }}>
                      <i className={`fmt ${primary}`}>{I(ICON[primary])}</i>
                      <div className="doc-main">
                        <h3>
                          {d.title}
                          {!viewer.isVisitor && <span className="ver">{d.version}</span>}
                          {!viewer.isVisitor && d.audience === "staff" && <span className="ver staff">staff only</span>}
                        </h3>
                        <p>{d.blurb}</p>
                      </div>
                      <div className="doc-acts">
                        {ORDER.filter((f) => d.files[f]).map((f, i) => (
                          <a
                            key={f}
                            className={`btn${i === 0 ? " primary" : ""}`}
                            href={`/documents/${encodeURIComponent(d.files[f]!)}`}
                            target={f === "html" || f === "pdf" ? "_blank" : undefined}
                            rel="noreferrer"
                            download={f === "xlsx" || f === "docx" || f === "json" ? d.files[f] : undefined}
                          >
                            {I(ICON[f])} {FORMAT_LABEL[f]}
                          </a>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </main>
    </>
  );
}
