import { readFile } from "node:fs/promises";
import path from "node:path";
import { currentViewer } from "@/lib/auth";
import { CONTENT_TYPES, findFile } from "@/lib/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The generated documents are laid out for print: the body has no margin and the page margins come from @page,
 *  which only applies when printing. Read online, that put the text flush against the window edges. This adds a
 *  screen-only sheet — A4 width, white, centred, with the print margins as padding — and leaves print untouched. */
function forScreen(html: string): string {
  const landscape = /size:\s*A4 landscape/.test(html);
  const css = `<style id="screen-sheet">@media screen{html{background:#e6e7ea;margin:0}body{box-sizing:border-box;width:100%;max-width:${landscape ? "297mm" : "210mm"};min-height:100vh;margin:0 auto;padding:${landscape ? "12mm 14mm 16mm" : "16mm 18mm 24mm"};background:#fff;box-shadow:0 0 0 1px #d4d6db,0 6px 24px rgba(0,0,0,.08)}@media (max-width:760px){body{padding:16px 16px 32px}}}</style>`;
  return html.includes("</head>") ? html.replace("</head>", css + "</head>") : css + html;
}

/** Serves one file of the document pack from docs/, to signed-in users only. Only files listed in
 *  src/lib/documents.ts are served, and staff-only documents are refused for visitor accounts. */
export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const viewer = await currentViewer();
  if (!viewer) return new Response("Unauthorized", { status: 401 });
  const { file } = await ctx.params;
  const hit = findFile(decodeURIComponent(file));
  if (!hit) return new Response("Not found", { status: 404 });
  if (hit.doc.audience === "staff" && viewer.isVisitor) return new Response("Forbidden", { status: 403 });

  const name = hit.doc.files[hit.format]!;
  let body: Buffer;
  try {
    body = await readFile(path.join(process.cwd(), "docs", name));
  } catch {
    return new Response("The file is missing from this deployment", { status: 404 });
  }
  if (hit.format === "html") body = Buffer.from(forScreen(body.toString("utf8")), "utf8");
  const inline = hit.format === "html" || hit.format === "pdf";
  return new Response(new Uint8Array(body), {
    headers: {
      "content-type": CONTENT_TYPES[hit.format],
      "content-length": String(body.byteLength),
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${name}"`,
      "cache-control": "private, max-age=3600",
      "x-robots-tag": "noindex",
    },
  });
}
