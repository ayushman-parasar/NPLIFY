import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import TopBar from "@/components/TopBar";
import { currentViewer } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

const when = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");

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

  const questions = messages.filter((m) => m.role === "user").length;
  const sessions = new Set(messages.map((m) => m.sessionId)).size;
  const people = new Set([...messages, ...events, ...flags].map((r) => r.email).filter(Boolean)).size;
  const delay = (i: number) => ({ animationDelay: `${Math.min(i, 20) * 25}ms` });

  return (
    <>
      <TopBar viewer={viewer} active="admin" sub="Activity log" />
      <main className="admin">
        <div className="head">
          <h1>
            Activity log
            <small>{db ? "Most recent 300 chat messages, 200 flags and 300 map events." : "No database configured: nothing is being recorded."}</small>
          </h1>
        </div>

        <div className="stat-row">
          <div className="stat" style={delay(0)}>
            <b>{questions}</b>
            <span>questions asked</span>
          </div>
          <div className="stat" style={delay(1)}>
            <b>{sessions}</b>
            <span>chat sessions</span>
          </div>
          <div className="stat" style={delay(2)}>
            <b>{flags.length}</b>
            <span>entity flags</span>
          </div>
          <div className="stat" style={delay(3)}>
            <b>{events.length}</b>
            <span>map events</span>
          </div>
          <div className="stat" style={delay(4)}>
            <b>{people}</b>
            <span>people active</span>
          </div>
        </div>

        <h2>Flags ({flags.length})</h2>
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>Entity</th>
              <th>Comment</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {flags.length === 0 && (
              <tr>
                <td colSpan={5} className="mono">
                  no flags yet
                </td>
              </tr>
            )}
            {flags.map((f, i) => (
              <tr key={f.id} style={delay(i)}>
                <td className="mono">{when(f.createdAt)}</td>
                <td>{f.email}</td>
                <td>
                  <span className="ent">{f.entity}</span>
                </td>
                <td className="wrap">{f.comment}</td>
                <td className="mono">{f.resolved ? "resolved" : "open"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>Chat ({messages.length})</h2>
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>Session</th>
              <th>Role</th>
              <th>Content</th>
              <th>Entities</th>
              <th>Model · cache read · output · ms · feedback</th>
            </tr>
          </thead>
          <tbody>
            {messages.length === 0 && (
              <tr>
                <td colSpan={7} className="mono">
                  no messages yet
                </td>
              </tr>
            )}
            {messages.map((m, i) => (
              <tr key={m.id} style={delay(i)}>
                <td className="mono">{when(m.createdAt)}</td>
                <td>{m.email}</td>
                <td className="mono">{m.sessionId.slice(0, 8)}</td>
                <td>
                  <span className={`role ${m.role}`}>{m.role}</span>
                </td>
                <td className="wrap">{m.content}</td>
                <td>
                  {(m.entities ?? []).map((e) => (
                    <span key={e} className="ent">
                      {e}
                    </span>
                  ))}
                </td>
                <td className="mono">
                  {m.role === "assistant" ? `${m.model ?? ""} · ${m.cacheRead ?? 0} · ${m.output ?? 0} · ${m.latencyMs ?? 0} · ${m.feedback ?? "-"}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>Map events ({events.length})</h2>
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>Type</th>
              <th>Payload</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 && (
              <tr>
                <td colSpan={4} className="mono">
                  no events yet
                </td>
              </tr>
            )}
            {events.map((e, i) => (
              <tr key={i} style={delay(i)}>
                <td className="mono">{when(e.createdAt)}</td>
                <td>{e.email}</td>
                <td className="mono">{e.type}</td>
                <td className="mono" style={{ whiteSpace: "normal" }}>
                  {JSON.stringify(e.payload)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </>
  );
}
