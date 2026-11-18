import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import argon2 from "argon2";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { env, isProduction } from "./env.js";
import { db, migrate } from "./db.js";

const app = Fastify({ logger: true, trustProxy: false, bodyLimit: 1_048_576 });
const cookieName = isProduction ? "__Host-cineverse_session" : "cineverse_session";
const sessionMs = env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const sessionCookie = {
  path: "/",
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax" as const,
  maxAge: Math.floor(sessionMs / 1000)
};

await app.register(helmet, { contentSecurityPolicy: false });
await app.register(cors, { origin: env.WEB_ORIGIN, credentials: true });
await app.register(cookie);
await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });

app.get("/health/live", async () => ({ status: "ok" }));
app.get("/health/ready", async (_request, reply) => {
  try {
    await db.query("SELECT 1");
    return { status: "ready", database: "connected" };
  } catch {
    return reply.code(503).send({ status: "not_ready", database: "unavailable" });
  }
});

async function getSession(request: typeof app extends never ? never : import("fastify").FastifyRequest) {
  const token = request.cookies[cookieName];
  if (!token || token.length > 256) return null;
  const result = await db.query(
    `SELECT s.id AS session_id, s.user_id, u.email
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`,
    [hash(token)]
  );
  return result.rows[0] ?? null;
}

const credentialsSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(10).max(128)
});

app.post("/api/v1/auth/register", { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } }, async (request, reply) => {
  const parsed = credentialsSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
  const email = parsed.data.email.trim().toLowerCase();
  const passwordHash = await argon2.hash(parsed.data.password, { type: argon2.argon2id });
  const userId = randomUUID();
  const profileId = randomUUID();
  const token = randomBytes(32).toString("base64url");
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)", [userId, email, passwordHash]);
    await client.query("INSERT INTO profiles(id,account_id,name) VALUES($1,$2,$3)", [profileId, userId, "Principal"]);
    await client.query(
      "INSERT INTO sessions(id,user_id,token_hash,expires_at,user_agent) VALUES($1,$2,$3,now()+($4 || ' days')::interval,$5)",
      [randomUUID(), userId, hash(token), String(env.SESSION_TTL_DAYS), request.headers["user-agent"]?.slice(0, 500) ?? null]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23505") return reply.code(409).send({ error: "email_already_registered" });
    throw error;
  } finally {
    client.release();
  }
  reply.setCookie(cookieName, token, sessionCookie);
  return reply.code(201).send({ user: { id: userId, email }, profiles: [{ id: profileId, name: "Principal", isKids: false }] });
});

app.post("/api/v1/auth/login", { config: { rateLimit: { max: 8, timeWindow: "15 minutes" } } }, async (request, reply) => {
  const parsed = credentialsSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
  const result = await db.query("SELECT id,email,password_hash FROM users WHERE lower(email)=lower($1)", [parsed.data.email.trim()]);
  const user = result.rows[0];
  const valid = user ? await argon2.verify(user.password_hash, parsed.data.password) : await argon2.verify(
    "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$MDEyMzQ1Njc4OWFiY2RlZg",
    parsed.data.password
  ).catch(() => false);
  if (!user || !valid) return reply.code(401).send({ error: "invalid_credentials" });
  const token = randomBytes(32).toString("base64url");
  await db.query(
    "INSERT INTO sessions(id,user_id,token_hash,expires_at,user_agent) VALUES($1,$2,$3,now()+($4 || ' days')::interval,$5)",
    [randomUUID(), user.id, hash(token), String(env.SESSION_TTL_DAYS), request.headers["user-agent"]?.slice(0, 500) ?? null]
  );
  reply.setCookie(cookieName, token, sessionCookie);
  return { user: { id: user.id, email: user.email } };
});

app.post("/api/v1/auth/logout", async (request, reply) => {
  const token = request.cookies[cookieName];
  if (token) await db.query("UPDATE sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL", [hash(token)]);
  reply.clearCookie(cookieName, { path: "/", secure: isProduction, httpOnly: true, sameSite: "lax" });
  return { ok: true };
});

app.get("/api/v1/auth/me", async (request, reply) => {
  const session = await getSession(request);
  if (!session) return reply.code(401).send({ error: "unauthenticated" });
  const profiles = await db.query(
    "SELECT id,name,avatar_key,is_kids,last_seen_at,(online_until > now()) AS online FROM profiles WHERE account_id=$1 ORDER BY created_at",
    [session.user_id]
  );
  return { user: { id: session.user_id, email: session.email }, profiles: profiles.rows };
});

const profileSchema = z.object({
  name: z.string().trim().min(1).max(24),
  avatarKey: z.enum(["coral", "blue", "mint", "violet", "amber"]).default("coral"),
  isKids: z.boolean().default(false)
});

app.post("/api/v1/profiles", async (request, reply) => {
  const session = await getSession(request);
  if (!session) return reply.code(401).send({ error: "unauthenticated" });
  const parsed = profileSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [session.user_id]);
    const count = await client.query("SELECT count(*)::int AS count FROM profiles WHERE account_id=$1", [session.user_id]);
    if (count.rows[0].count >= 5) {
      await client.query("ROLLBACK");
      return reply.code(409).send({ error: "profile_limit_reached", limit: 5 });
    }
    const id = randomUUID();
    await client.query(
      "INSERT INTO profiles(id,account_id,name,avatar_key,is_kids) VALUES($1,$2,$3,$4,$5)",
      [id, session.user_id, parsed.data.name, parsed.data.avatarKey, parsed.data.isKids]
    );
    await client.query("COMMIT");
    return reply.code(201).send({ id, ...parsed.data });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

app.patch("/api/v1/profiles/:profileId", async (request, reply) => {
  const session = await getSession(request);
  if (!session) return reply.code(401).send({ error: "unauthenticated" });
  const parsed = profileSchema.partial().safeParse(request.body);
  if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) return reply.code(400).send({ error: "invalid_input" });
  const profileId = z.string().uuid().safeParse((request.params as { profileId?: string }).profileId);
  if (!profileId.success) return reply.code(400).send({ error: "invalid_profile_id" });
  const result = await db.query(
    `UPDATE profiles SET name=COALESCE($1,name), avatar_key=COALESCE($2,avatar_key),
     is_kids=COALESCE($3,is_kids), updated_at=now()
     WHERE id=$4 AND account_id=$5 RETURNING id,name,avatar_key,is_kids`,
    [parsed.data.name ?? null, parsed.data.avatarKey ?? null, parsed.data.isKids ?? null, profileId.data, session.user_id]
  );
  if (!result.rowCount) return reply.code(404).send({ error: "profile_not_found" });
  return result.rows[0];
});

app.delete("/api/v1/profiles/:profileId", async (request, reply) => {
  const session = await getSession(request);
  if (!session) return reply.code(401).send({ error: "unauthenticated" });
  const profileId = z.string().uuid().safeParse((request.params as { profileId?: string }).profileId);
  if (!profileId.success) return reply.code(400).send({ error: "invalid_profile_id" });
  const result = await db.query("DELETE FROM profiles WHERE id=$1 AND account_id=$2 RETURNING id", [profileId.data, session.user_id]);
  if (!result.rowCount) return reply.code(404).send({ error: "profile_not_found" });
  return reply.code(204).send();
});

app.post("/api/v1/profiles/:profileId/presence", async (request, reply) => {
  const session = await getSession(request);
  if (!session) return reply.code(401).send({ error: "unauthenticated" });
  const profileId = z.string().uuid().safeParse((request.params as { profileId?: string }).profileId);
  if (!profileId.success) return reply.code(400).send({ error: "invalid_profile_id" });
  const result = await db.query(
    "UPDATE profiles SET last_seen_at=now(), online_until=now()+interval '90 seconds' WHERE id=$1 AND account_id=$2 RETURNING id,online_until",
    [profileId.data, session.user_id]
  );
  if (!result.rowCount) return reply.code(404).send({ error: "profile_not_found" });
  return result.rows[0];
});

app.addHook("onRequest", async (request, reply) => {
  if (request.method === "OPTIONS" || request.url.startsWith("/health/")) return;
  const origin = request.headers.origin;
  if (origin && origin !== env.WEB_ORIGIN) return reply.code(403).send({ error: "origin_not_allowed" });
});

await migrate();
try {
  await app.listen({ host: "0.0.0.0", port: env.PORT });
} catch (error) {
  app.log.error(error);
  await db.end();
  process.exit(1);
}

const shutdown = async () => {
  await app.close();
  await db.end();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
