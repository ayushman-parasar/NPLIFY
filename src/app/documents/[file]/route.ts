import { readFile } from "node:fs/promises";
import path from "node:path";
import { currentViewer } from "@/lib/auth";
import { CONTENT_TYPES, findFile } from "@/lib/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
