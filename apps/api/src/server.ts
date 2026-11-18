import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import rawBody from "fastify-raw-body";
import argon2 from "argon2";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { env, isProduction, superAdminEmails } from "./env.js";
import { db, migrate } from "./db.js";
import { getIntegrationStatuses, verifyStripeSignature } from "./integrations.js";

const app = Fastify({ logger: true, trustProxy: false, bodyLimit: 1_048_576 });
const cookieName = isProduction ? "__Host-cineverse_session" : "cineverse_session";
const sessionMs = env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
const hash = (value: string) => createHmac("sha256", env.SESSION_SECRET).update(value).digest("hex");
const dummyPasswordHash = await argon2.hash(randomBytes(32).toString("hex"), { type: argon2.argon2id });
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
await app.register(rawBody, { field: "rawBody", global: false, encoding: false, runFirst: true });
await app.register(rawBody, { field: "rawBody", global: false, encoding: false, runFirst: true });

app.addHook("onRequest", async (request, reply) => {
  if (request.method === "OPTIONS" || request.url.startsWith("/health/")) return;
  const origin = request.headers.origin;
  if (origin && origin !== env.WEB_ORIGIN) return reply.code(403).send({ error: "origin_not_allowed" });
});

app.get("/health/live", async () => ({ status: "ok" }));
app.get("/health/ready", async (_request, reply) => {
  try {
    await db.query("SELECT 1");
    return { status: "ready", database: "connected" };
  } catch {
    return reply.code(503).send({ status: "not_ready", database: "unavailable" });
  }
});

async function getSession(request: FastifyRequest) {
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
    await client.query("INSERT INTO profiles(id,account_id,name,is_primary) VALUES($1,$2,$3,true)", [profileId, userId, "Principal"]);
    if (superAdminEmails.includes(email)) await client.query("INSERT INTO user_roles(user_id,role_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [userId, "super_admin"]);
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
  const valid = await argon2.verify(user?.password_hash ?? dummyPasswordHash, parsed.data.password);
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
    "SELECT id,name,avatar_key,is_kids,is_primary,last_seen_at,(online_until > now()) AS online FROM profiles WHERE account_id=$1 ORDER BY created_at",
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
  const result = await db.query("DELETE FROM profiles WHERE id=$1 AND account_id=$2 AND is_primary=false RETURNING id", [profileId.data, session.user_id]);
  if (!result.rowCount) {
    const existing = await db.query("SELECT is_primary FROM profiles WHERE id=$1 AND account_id=$2", [profileId.data, session.user_id]);
    if (existing.rows[0]?.is_primary) return reply.code(409).send({ error: "primary_profile_cannot_be_deleted" });
    return reply.code(404).send({ error: "profile_not_found" });
  }
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


async function requireAdmin(request: FastifyRequest, reply: import("fastify").FastifyReply) {
  const session = await getSession(request);
  if (!session) {
    reply.code(401).send({ error: "unauthenticated" });
    return null;
  }
  const role = await db.query(
    "SELECT role_id FROM user_roles WHERE user_id=$1 AND role_id IN ($2,$3) LIMIT 1",
    [session.user_id, "super_admin", "admin"]
  );
  if (!role.rowCount) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return session;
}

const catalogImportSchema = z.object({
  items: z.array(z.object({
    type: z.enum(["movie", "tv"]),
    title: z.string().trim().min(1).max(240),
    synopsis: z.string().max(10000).optional(),
    year: z.number().int().min(1888).max(2100).optional(),
    posterUrl: z.string().url().max(2048).optional(),
    tmdbId: z.number().int().positive().optional()
  })).min(1).max(100)
});

app.get("/api/v1/catalog", async (request, reply) => {
  const parsed = z.object({
    type: z.enum(["movie", "tv"]).optional(),
    q: z.string().trim().max(120).optional()
  }).safeParse(request.query);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_query" });
  const result = await db.query(
    "SELECT id,content_type,title,synopsis,release_year,poster_url FROM catalog_items WHERE publication_status='published' AND rights_status='verified' AND (rights_expires_at IS NULL OR rights_expires_at > now()) AND ($1::text IS NULL OR content_type=$1) AND ($2::text IS NULL OR title ILIKE '%' || $2 || '%') ORDER BY published_at DESC NULLS LAST, title ASC LIMIT 100",
    [parsed.data.type ?? null, parsed.data.q ?? null]
  );
  return { items: result.rows };
});

app.get("/api/v1/admin/catalog", async (request, reply) => {
  const session = await requireAdmin(request, reply);
  if (!session) return;
  const result = await db.query(
    "SELECT id,content_type,title,synopsis,release_year,poster_url,tmdb_id,publication_status,rights_status,rights_reference,rights_expires_at,created_at,updated_at FROM catalog_items ORDER BY updated_at DESC LIMIT 500"
  );
  return { items: result.rows };
});

app.post("/api/v1/admin/catalog/import", async (request, reply) => {
  const session = await requireAdmin(request, reply);
  if (!session) return;
  const parsed = catalogImportSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_import", details: parsed.error.flatten() });
  const client = await db.connect();
  const importedIds: string[] = [];
  try {
    await client.query("BEGIN");
    for (const item of parsed.data.items) {
      const values = [randomUUID(), item.type, item.title, item.synopsis ?? null, item.year ?? null, item.posterUrl ?? null, item.tmdbId ?? null, session.user_id];
      const result = item.tmdbId
        ? await client.query(
            "INSERT INTO catalog_items(id,content_type,title,synopsis,release_year,poster_url,tmdb_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (tmdb_id) WHERE tmdb_id IS NOT NULL DO UPDATE SET content_type=EXCLUDED.content_type,title=EXCLUDED.title,synopsis=EXCLUDED.synopsis,release_year=EXCLUDED.release_year,poster_url=EXCLUDED.poster_url,updated_at=now() RETURNING id",
            values
          )
        : await client.query(
            "INSERT INTO catalog_items(id,content_type,title,synopsis,release_year,poster_url,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
            [values[0], values[1], values[2], values[3], values[4], values[5], values[7]]
          );
      importedIds.push(result.rows[0].id);
    }
    await client.query(
      "INSERT INTO audit_logs(id,actor_user_id,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)",
      [randomUUID(), session.user_id, "admin.catalog.imported", "catalog_batch", null, JSON.stringify({ count: importedIds.length })]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return reply.code(201).send({ imported: importedIds.length, ids: importedIds, publicationStatus: "draft", rightsStatus: "pending" });
});


app.get("/api/v1/admin/integrations", async (request, reply) => {
  const session = await requireAdmin(request, reply);
  if (!session) return;
  return { integrations: await getIntegrationStatuses() };
});

app.post("/api/v1/admin/integrations/email/test", async (request, reply) => {
  const session = await requireAdmin(request, reply);
  if (!session) return;
  const parsed = z.object({ to: z.string().email().max(254) }).safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_email" });
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return reply.code(503).send({ error: "email_not_configured" });
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [parsed.data.to], subject: "Test de configuration Cineverse", html: "<p>Le service e-mail transactionnel Cineverse est correctement connecté.</p>" }),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) return reply.code(502).send({ error: "email_provider_rejected_request" });
  const result = await response.json() as { id?: string };
  await db.query("INSERT INTO audit_logs(id,actor_user_id,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)", [randomUUID(), session.user_id, "admin.integration.email_test", "email", parsed.data.to, JSON.stringify({ provider: "resend", messageId: result.id ?? null })]);
  return { sent: true, providerMessageId: result.id ?? null };
});

app.get("/api/v1/integrations/tmdb/search", async (request, reply) => {
  const parsed = z.object({ q: z.string().trim().min(1).max(100), type: z.enum(["movie", "tv"]).default("movie"), page: z.coerce.number().int().min(1).max(10).default(1) }).safeParse(request.query);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_query" });
  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  const key = process.env.TMDB_API_KEY;
  if (!token && !key) return reply.code(503).send({ error: "tmdb_not_configured" });
  const url = new URL("https://api.themoviedb.org/3/search/" + parsed.data.type);
  url.searchParams.set("query", parsed.data.q);
  url.searchParams.set("page", String(parsed.data.page));
  if (!token && key) url.searchParams.set("api_key", key);
  try {
    const response = await fetch(url, { headers: token ? { Authorization: "Bearer " + token, accept: "application/json" } : { accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) return reply.code(response.status === 401 ? 502 : response.status).send({ error: "tmdb_request_failed" });
    const data = await response.json() as { page: number; total_results: number; results: Array<Record<string, unknown>> };
    return { page: data.page, totalResults: data.total_results, results: data.results.map(item => ({ id: item.id, title: item.title ?? item.name, synopsis: item.overview, releaseDate: item.release_date ?? item.first_air_date, posterPath: item.poster_path, type: parsed.data.type })) };
  } catch { return reply.code(502).send({ error: "tmdb_unavailable" }); }
});

app.get("/api/v1/auth/discord", async (_request, reply) => {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;
  if (!clientId || !process.env.DISCORD_CLIENT_SECRET || !redirectUri) return reply.code(503).send({ error: "discord_not_configured" });
  const state = randomBytes(24).toString("base64url");
  reply.setCookie("cineverse_discord_state", state, { path: "/api/v1/auth/discord/callback", httpOnly: true, secure: isProduction, sameSite: "lax", maxAge: 600 });
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "identify email");
  url.searchParams.set("state", state);
  return reply.redirect(url.toString());
});

app.get("/api/v1/auth/discord/callback", async (request, reply) => {
  const parsed = z.object({ code: z.string().min(1), state: z.string().min(1) }).safeParse(request.query);
  const expectedState = request.cookies.cineverse_discord_state;
  reply.clearCookie("cineverse_discord_state", { path: "/api/v1/auth/discord/callback", secure: isProduction, httpOnly: true, sameSite: "lax" });
  if (!parsed.success || !expectedState || parsed.data.state !== expectedState) return reply.code(400).send({ error: "invalid_oauth_state" });
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return reply.code(503).send({ error: "discord_not_configured" });
  try {
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "authorization_code", code: parsed.data.code, redirect_uri: redirectUri }), signal: AbortSignal.timeout(8000) });
    if (!tokenResponse.ok) return reply.code(401).send({ error: "discord_token_exchange_failed" });
    const tokenData = await tokenResponse.json() as { access_token: string; token_type: string };
    const userResponse = await fetch("https://discord.com/api/users/@me", { headers: { Authorization: tokenData.token_type + " " + tokenData.access_token }, signal: AbortSignal.timeout(8000) });
    if (!userResponse.ok) return reply.code(401).send({ error: "discord_identity_failed" });
    const identity = await userResponse.json() as { id: string; email?: string; verified?: boolean };
    if (!identity.email || !identity.verified) return reply.code(403).send({ error: "discord_verified_email_required" });
    const existing = await db.query("SELECT u.id FROM oauth_accounts o JOIN users u ON u.id=o.user_id WHERE o.provider=$1 AND o.provider_user_id=$2", ["discord", identity.id]);
    let userId: string;
    if (existing.rowCount) userId = existing.rows[0].id;
    else {
      const emailOwner = await db.query("SELECT id FROM users WHERE lower(email)=lower($1)", [identity.email]);
      if (emailOwner.rowCount) return reply.code(409).send({ error: "email_already_registered_login_to_link" });
      userId = randomUUID();
      const temporaryPasswordHash = await argon2.hash(randomBytes(48).toString("hex"), { type: argon2.argon2id });
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        await client.query("INSERT INTO users(id,email,password_hash,email_verified_at) VALUES($1,$2,$3,now())", [userId, identity.email.toLowerCase(), temporaryPasswordHash]);
        await client.query("INSERT INTO profiles(id,account_id,name,is_primary) VALUES($1,$2,$3,true)", [randomUUID(), userId, "Principal"]);
        await client.query("INSERT INTO oauth_accounts(id,user_id,provider,provider_user_id,provider_email) VALUES($1,$2,$3,$4,$5)", [randomUUID(), userId, "discord", identity.id, identity.email.toLowerCase()]);
        if (superAdminEmails.includes(identity.email.toLowerCase())) await client.query("INSERT INTO user_roles(user_id,role_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [userId, "super_admin"]);
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    }
    const token = randomBytes(32).toString("base64url");
    await db.query("INSERT INTO sessions(id,user_id,token_hash,expires_at,user_agent) VALUES($1,$2,$3,now()+($4 || ' days')::interval,$5)", [randomUUID(), userId, hash(token), String(env.SESSION_TTL_DAYS), request.headers["user-agent"]?.slice(0, 500) ?? null]);
    reply.setCookie(cookieName, token, sessionCookie);
    return reply.redirect(env.WEB_ORIGIN + "/?auth=discord");
  } catch (error) { request.log.error(error); return reply.code(502).send({ error: "discord_login_failed" }); }
});

app.post("/api/v1/billing/checkout", async (request, reply) => {
  const session = await getSession(request);
  if (!session) return reply.code(401).send({ error: "unauthenticated" });
  const parsed = z.object({ priceId: z.string().min(1).max(120) }).safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "invalid_price" });
  const allowedPrices = (process.env.STRIPE_PRICE_IDS ?? "").split(",").map(value => value.trim()).filter(Boolean);
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey || !allowedPrices.includes(parsed.data.priceId)) return reply.code(503).send({ error: "billing_not_configured" });
  const form = new URLSearchParams({ mode: "subscription", "line_items[0][price]": parsed.data.priceId, "line_items[0][quantity]": "1", success_url: process.env.STRIPE_SUCCESS_URL ?? env.WEB_ORIGIN + "/billing/success", cancel_url: process.env.STRIPE_CANCEL_URL ?? env.WEB_ORIGIN + "/billing/cancel", client_reference_id: session.user_id, "metadata[user_id]": session.user_id, "subscription_data[metadata][user_id]": session.user_id });
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { Authorization: "Bearer " + stripeKey, "Content-Type": "application/x-www-form-urlencoded" }, body: form, signal: AbortSignal.timeout(10000) });
  const data = await response.json() as { id?: string; url?: string };
  if (!response.ok || !data.id || !data.url) return reply.code(502).send({ error: "stripe_checkout_failed" });
  await db.query("INSERT INTO vip_subscriptions(id,user_id,stripe_checkout_session_id,price_id,status) VALUES($1,$2,$3,$4,'pending') ON CONFLICT (stripe_checkout_session_id) DO NOTHING", [randomUUID(), session.user_id, data.id, parsed.data.priceId]);
  return { checkoutUrl: data.url };
});

app.post("/api/v1/webhooks/stripe", { config: { rawBody: true } }, async (request, reply) => {
  const raw = (request as FastifyRequest & { rawBody?: Buffer }).rawBody;
  const signature = request.headers["stripe-signature"];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!raw || typeof signature !== "string" || !secret || !verifyStripeSignature(raw, signature, secret)) return reply.code(400).send({ error: "invalid_stripe_signature" });
  let event: { id: string; type: string; data: { object: Record<string, unknown> } };
  try { event = JSON.parse(raw.toString("utf8")); } catch { return reply.code(400).send({ error: "invalid_event" }); }
  const object = event.data.object;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query("INSERT INTO stripe_webhook_events(id,event_type) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id", [event.id, event.type]);
    if (!inserted.rowCount) { await client.query("COMMIT"); return { received: true, duplicate: true }; }
    if (event.type === "checkout.session.completed") {
      const metadata = object.metadata as Record<string, unknown> | undefined;
      const userId = String(object.client_reference_id ?? metadata?.user_id ?? "");
      if (userId) await client.query("UPDATE vip_subscriptions SET stripe_customer_id=$1,stripe_subscription_id=$2,status='active',updated_at=now() WHERE stripe_checkout_session_id=$3 AND user_id=$4", [object.customer ?? null, object.subscription ?? null, object.id, userId]);
    } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const status = event.type === "customer.subscription.deleted" ? "canceled" : String(object.status ?? "unknown");
      const end = typeof object.current_period_end === "number" ? new Date(object.current_period_end * 1000) : null;
      await client.query("UPDATE vip_subscriptions SET status=$1,current_period_end=$2,updated_at=now() WHERE stripe_subscription_id=$3", [status, end, object.id]);
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  return { received: true };
});

app.get("/api/v1/billing/subscription", async (request, reply) => {
  const session = await getSession(request);
  if (!session) return reply.code(401).send({ error: "unauthenticated" });
  const result = await db.query("SELECT status,current_period_end,price_id,created_at FROM vip_subscriptions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1", [session.user_id]);
  return { subscription: result.rows[0] ?? null };
});

app.get("/api/v1/admin/overview", async (request, reply) => {
  const session = await getSession(request);
  if (!session) return reply.code(401).send({ error: "unauthenticated" });
  const role = await db.query("SELECT role_id FROM user_roles WHERE user_id=$1 AND role_id IN ($2,$3) LIMIT 1", [session.user_id, "super_admin", "admin"]);
  if (!role.rowCount) return reply.code(403).send({ error: "forbidden" });
  const started = performance.now();
  await db.query("SELECT 1");
  const databaseLatencyMs = Math.round((performance.now() - started) * 100) / 100;
  const [users, profiles, onlineProfiles, sessions] = await Promise.all([
    db.query("SELECT count(*)::int AS count FROM users"),
    db.query("SELECT count(*)::int AS count FROM profiles"),
    db.query("SELECT count(*)::int AS count FROM profiles WHERE online_until > now()"),
    db.query("SELECT count(*)::int AS count FROM sessions WHERE revoked_at IS NULL AND expires_at > now()")
  ]);
  return { generatedAt: new Date().toISOString(), uptimeSeconds: Math.floor(process.uptime()), database: { status: "connected", latencyMs: databaseLatencyMs }, counts: { users: users.rows[0].count, profiles: profiles.rows[0].count, onlineProfiles: onlineProfiles.rows[0].count, activeSessions: sessions.rows[0].count }, integrations: { discord: Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET), tmdb: Boolean(process.env.TMDB_API_KEY), stripe: Boolean(process.env.STRIPE_SECRET_KEY) } };
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
