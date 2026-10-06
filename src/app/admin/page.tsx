import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { currentViewer } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

const cell: React.CSSProperties = { padding: "6px 8px", borderTop: "1px solid var(--line)", verticalAlign: "top", fontSize: 12.5 };
const mono: React.CSSProperties = { ...cell, fontFamily: "var(--font-mono)", whiteSpace: "nowrap" };

export default async function AdminPage() {
  const viewer = await currentViewer();
  if (!viewer) redirect("/login");
  if (!viewer.isAdmin) redirect("/");
  const db = getDb();

  const messages = db
    ? await db
        .select({
          id: schema.chatMessages.id,
          sessionId: schema.chatMessages.sessionId,
          role: schema.chatMessages.role,
          content: schema.chatMessages.content,
          entities: schema.chatMessages.entities,
          model: schema.chatMessages.model,
          feedback: schema.chatMessages.feedback,
          latencyMs: schema.chatMessages.latencyMs,
          cacheRead: schema.chatMessages.cacheReadTokens,
          output: schema.chatMessages.outputTokens,
          createdAt: schema.chatMessages.createdAt,
          email: schema.users.email,
        })
        .from(schema.chatMessages)
        .leftJoin(schema.users, eq(schema.users.id, schema.chatMessages.userId))
        .orderBy(desc(schema.chatMessages.createdAt))
        .limit(300)
    : [];

  const flags = db
    ? await db
        .select({
          id: schema.entityFlags.id,
          entity: schema.entityFlags.entity,
          comment: schema.entityFlags.comment,
          resolved: schema.entityFlags.resolved,
          createdAt: schema.entityFlags.createdAt,
          email: schema.users.email,
        })
        .from(schema.entityFlags)
        .leftJoin(schema.users, eq(schema.users.id, schema.entityFlags.userId))
        .orderBy(desc(schema.entityFlags.createdAt))
        .limit(200)
    : [];

  const events = db
    ? await db
        .select({ type: schema.events.type, payload: schema.events.payload, createdAt: schema.events.createdAt, email: schema.users.email })
        .from(schema.events)
        .leftJoin(schema.users, eq(schema.users.id, schema.events.userId))
        .orderBy(desc(schema.events.createdAt))
        .limit(300)
    : [];

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "16px", fontFamily: "var(--font-ui)" }}>
      <p style={{ margin: "0 0 12px" }}>
        <Link href="/">← Back to the map</Link>
      </p>
      <h1 style={{ fontSize: 18, margin: "0 0 4px" }}>Activity log</h1>
      <p style={{ color: "var(--muted)", margin: "0 0 16px", fontSize: 13 }}>
        {db ? "Most recent 300 chat messages, 200 flags and 300 map events." : "No database configured: nothing is being recorded."}
      </p>

      <h2 style={{ fontSize: 14, margin: "16px 0 6px" }}>Flags ({flags.length})</h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", fontSize: 11, color: "var(--muted)" }}>
            <th style={cell}>When</th><th style={cell}>Who</th><th style={cell}>Entity</th><th style={cell}>Comment</th><th style={cell}>Status</th>
          </tr>
        </thead>
        <tbody>
          {flags.map((f) => (
            <tr key={f.id}>
              <td style={mono}>{f.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
              <td style={cell}>{f.email}</td>
              <td style={mono}>{f.entity}</td>
              <td style={cell}>{f.comment}</td>
              <td style={cell}>{f.resolved ? "resolved" : "open"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ fontSize: 14, margin: "24px 0 6px" }}>Conversations ({messages.length} messages)</h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", fontSize: 11, color: "var(--muted)" }}>
            <th style={cell}>When</th><th style={cell}>Who</th><th style={cell}>Session</th><th style={cell}>Role</th><th style={cell}>Text</th><th style={cell}>Entities</th><th style={cell}>Model · cache · out · ms · 👍👎</th>
          </tr>
        </thead>
        <tbody>
          {messages.map((m) => (
            <tr key={m.id}>
              <td style={mono}>{m.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
              <td style={cell}>{m.email}</td>
              <td style={mono}>{m.sessionId.slice(0, 8)}</td>
              <td style={cell}>{m.role}</td>
              <td style={{ ...cell, whiteSpace: "pre-wrap", maxWidth: 520 }}>{m.content}</td>
              <td style={{ ...mono, whiteSpace: "normal" }}>{(m.entities ?? []).join(", ")}</td>
              <td style={mono}>
                {m.role === "assistant" ? `${m.model ?? ""} · ${m.cacheRead ?? 0} · ${m.output ?? 0} · ${m.latencyMs ?? 0} · ${m.feedback ?? "-"}` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ fontSize: 14, margin: "24px 0 6px" }}>Map events ({events.length})</h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", fontSize: 11, color: "var(--muted)" }}>
            <th style={cell}>When</th><th style={cell}>Who</th><th style={cell}>Type</th><th style={cell}>Payload</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e, i) => (
            <tr key={i}>
              <td style={mono}>{e.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
              <td style={cell}>{e.email}</td>
              <td style={mono}>{e.type}</td>
              <td style={{ ...mono, whiteSpace: "normal" }}>{JSON.stringify(e.payload)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
