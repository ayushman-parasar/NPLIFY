import { z } from "zod";
import { currentViewer } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { data, KB_VERSION } from "@/lib/kb";

export const runtime = "nodejs";

const Body = z.object({
  entity: z.string().refine((e) => e in data.E, "unknown entity"),
  comment: z.string().min(1).max(2000),
});

export async function POST(req: Request) {
  if (process.env.NEXT_PUBLIC_FLAGGING_ENABLED !== "true") return new Response("Flagging is disabled", { status: 403 });
  const viewer = await currentViewer();
  if (!viewer) return new Response("Unauthorized", { status: 401 });
  if (viewer.isVisitor) return new Response("Forbidden", { status: 403 }); // flagging is for NPL and New XP staff
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  const db = getDb();
  if (db) await db.insert(schema.entityFlags).values({ userId: viewer.id, entity: parsed.data.entity, comment: parsed.data.comment, kbVersion: KB_VERSION });
  return new Response(null, { status: 204 });
}
