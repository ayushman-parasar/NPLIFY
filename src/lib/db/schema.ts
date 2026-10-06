import { boolean, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// ---- Users (seeded; email + password sign-in) ------------------------------------

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("user"), // user | admin
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// ---- Activity log ---------------------------------------------------------------

export const chatSessions = pgTable("chat_session", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  kbVersion: text("kb_version").notNull(),
  startedAt: timestamp("started_at", { mode: "date" }).notNull().defaultNow(),
});

export const chatMessages = pgTable("chat_message", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  sessionId: text("session_id")
    .notNull()
    .references(() => chatSessions.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  role: text("role").notNull(), // user | assistant
  content: text("content").notNull(),
  entities: jsonb("entities").$type<string[]>(),
  model: text("model"),
  kbVersion: text("kb_version"),
  stopReason: text("stop_reason"),
  inputTokens: integer("input_tokens"),
  cacheReadTokens: integer("cache_read_tokens"),
  cacheWriteTokens: integer("cache_write_tokens"),
  outputTokens: integer("output_tokens"),
  latencyMs: integer("latency_ms"),
  feedback: text("feedback"), // up | down | null
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const events = pgTable("event", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  type: text("type").notNull(), // entity_pinned | entity_unpinned | walkthrough | trace | tab | search
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const entityFlags = pgTable("entity_flag", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  entity: text("entity").notNull(),
  comment: text("comment").notNull(),
  resolved: boolean("resolved").notNull().default(false),
  kbVersion: text("kb_version"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});
