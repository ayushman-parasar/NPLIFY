import { z } from "zod";
import { currentViewer } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";

export const runtime = "nodejs";

const Body = z.object({
  type: z.enum(["entity_pinned", "entity_unpinned", "walkthrough", "trace", "tab", "search"]),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: Request) {
  const viewer = await currentViewer();
  if (!viewer) return new Response("Unauthorized", { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  const db = getDb();
  if (db) await db.insert(schema.events).values({ userId: viewer.id, type: parsed.data.type, payload: parsed.data.payload ?? {} });
  return new Response(null, { status: 204 });
}
