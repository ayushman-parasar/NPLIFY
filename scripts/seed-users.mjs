// Seed or update sign-in users. Works against any database: local, Neon branch, or production.
//
//   DATABASE_URL=postgres://... node scripts/seed-users.mjs seed/users.json
//   DATABASE_URL=postgres://... SEED_USERS='[{"email":"a@b.c","password":"...","name":"A","role":"admin"}]' node scripts/seed-users.mjs
//
// Each entry: { email, password, name?, role?: "user" | "admin", active?: true }.
// Existing emails are updated (password, name, role, active); new ones are inserted.
// Passwords are stored as scrypt hashes in the same format src/lib/password.ts verifies.
import fs from "node:fs";
import { randomBytes, scryptSync } from "node:crypto";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set"); process.exit(1); }

let users;
const file = process.argv[2];
if (file) users = JSON.parse(fs.readFileSync(file, "utf8"));
else if (process.env.SEED_USERS) users = JSON.parse(process.env.SEED_USERS);
else { console.error("Pass a JSON file path or set SEED_USERS"); process.exit(1); }
if (!Array.isArray(users) || !users.length) { console.error("No users to seed"); process.exit(1); }

const hash = (password) => {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
};

const sql = neon(url);
let inserted = 0, updated = 0;
for (const u of users) {
  const email = String(u.email ?? "").trim().toLowerCase();
  const password = String(u.password ?? "");
  if (!email.includes("@") || password.length < 8) { console.error(`skip ${email || "(no email)"}: need an email and a password of at least 8 characters`); continue; }
  const role = u.role === "admin" ? "admin" : "user";
  const active = u.active !== false;
  const rows = await sql`
    INSERT INTO "user" (id, email, name, password_hash, role, active)
    VALUES (${crypto.randomUUID()}, ${email}, ${u.name ?? null}, ${hash(password)}, ${role}, ${active})
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, active = EXCLUDED.active
    RETURNING (xmax = 0) AS inserted`;
  if (rows[0]?.inserted) inserted++; else updated++;
  console.log(`${rows[0]?.inserted ? "inserted" : "updated "} ${email} (${role}${active ? "" : ", inactive"})`);
}
console.log(`done: ${inserted} inserted, ${updated} updated`);
