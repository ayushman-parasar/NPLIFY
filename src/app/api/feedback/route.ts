import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { currentViewer } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";

export const runtime = "nodejs";

const Body = z.object({ messageId: z.string().min(8).max(64), feedback: z.enum(["up", "down"]) });

export async function POST(req: Request) {
  const viewer = await currentViewer();
  if (!viewer) return new Response("Unauthorized", { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  const db = getDb();
  if (db) {
    // A viewer can only rate answers given to them.
    await db
      .update(schema.chatMessages)
      .set({ feedback: parsed.data.feedback })
      .where(and(eq(schema.chatMessages.id, parsed.data.messageId), eq(schema.chatMessages.userId, viewer.id)));
  }
  return new Response(null, { status: 204 });
}
