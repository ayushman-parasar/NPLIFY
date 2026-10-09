import Anthropic from "@anthropic-ai/sdk";
import { and, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { currentViewer } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { KB_VERSION, SYSTEM_PROMPT } from "@/lib/kb";

export const runtime = "nodejs";
export const maxDuration = 120;

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";
const EFFORT = (process.env.ANTHROPIC_EFFORT ?? "medium") as "low" | "medium" | "high";
const DAILY_LIMIT = Number(process.env.ASK_DAILY_LIMIT ?? 200);

const Body = z.object({
  sessionId: z.string().min(8).max(64),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8000) }))
    .min(1)
    .max(30)
    .refine((m) => m[m.length - 1].role === "user", "last turn must be the user"),
});

const client = new Anthropic();

// Appended after the cached knowledge base for visitor accounts (client guests), so the cache prefix is unchanged.
const VISITOR_NOTE =
  "The person asking is a client guest, not NPL or New XP staff. Present the model as the data model, not as a draft under review: do not mention draft status, edition or version numbers (v3.0 … v5.x), decision numbers (D1 …), open questions, review dates or who decided what. If asked about them, say that review history is available to NPL staff. Everything else in your rules still applies.";

export async function POST(req: Request) {
  const viewer = await currentViewer();
  if (!viewer) return new Response("Unauthorized", { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  const { sessionId, messages } = parsed.data;
  const question = messages[messages.length - 1].content;

  const db = getDb();
  let messageId: string | null = null;
  if (db) {
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.chatMessages)
      .where(and(eq(schema.chatMessages.userId, viewer.id), eq(schema.chatMessages.role, "user"), gte(schema.chatMessages.createdAt, since)));
    if (n >= DAILY_LIMIT) return new Response("Daily question limit reached", { status: 429 });

    await db.insert(schema.chatSessions).values({ id: sessionId, userId: viewer.id, kbVersion: KB_VERSION }).onConflictDoNothing();
    await db.insert(schema.chatMessages).values({ sessionId, userId: viewer.id, role: "user", content: question, kbVersion: KB_VERSION });
    messageId = crypto.randomUUID();
  }

  const started = Date.now();
  // The knowledge base is identical on every request, so it is cached for an hour;
  // only the conversation turns are billed at full price.
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 8000,
    system: [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral", ttl: "1h" } },
      ...(viewer.isVisitor ? [{ type: "text" as const, text: VISITOR_NOTE }] : []),
    ],
    messages: messages.map((m) => ({ role: m.role, content: m.content }) as Anthropic.Beta.BetaMessageParam),
    output_config: { effort: EFFORT },
    // Safety-classifier declines are re-run on a fallback model inside the same call.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let text = "";
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            text += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") {
          const note = "\n\nThe assistant declined this request.";
          text += note;
          controller.enqueue(encoder.encode(note));
        } else if (final.stop_reason === "max_tokens") {
          const note = "\n\n(Answer cut short. Ask for less at a time.)";
          text += note;
          controller.enqueue(encoder.encode(note));
        }
        if (db && messageId) {
          const ents = (text.match(/\[\[map:\s*([^\]]*)\]\]\s*$/)?.[1] ?? "")
            .split(/[,\s]+/)
            .map((s) => s.trim())
            .filter(Boolean);
          await db.insert(schema.chatMessages).values({
            id: messageId,
            sessionId,
            userId: viewer.id,
            role: "assistant",
            content: text,
            entities: ents,
            model: final.model,
            kbVersion: KB_VERSION,
            stopReason: final.stop_reason ?? null,
            inputTokens: final.usage.input_tokens,
            cacheReadTokens: final.usage.cache_read_input_tokens ?? 0,
            cacheWriteTokens: final.usage.cache_creation_input_tokens ?? 0,
            outputTokens: final.usage.output_tokens,
            latencyMs: Date.now() - started,
          });
        }
      } catch (err) {
        let note = "\n\n(The assistant could not finish this answer. Please try again.)";
        if (err instanceof Anthropic.RateLimitError) note = "\n\n(The assistant is busy right now. Please try again in a minute.)";
        else if (err instanceof Anthropic.APIError) console.error("ask: API error", err.status, err.message);
        else console.error("ask: stream error", err);
        controller.enqueue(encoder.encode(note));
      } finally {
        controller.close();
      }
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-kb-version": KB_VERSION,
      ...(messageId ? { "x-message-id": messageId } : {}),
    },
  });
}
