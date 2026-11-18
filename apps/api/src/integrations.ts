import { timingSafeEqual } from "node:crypto";

export type IntegrationState = "connected" | "configured" | "missing" | "error";

export type IntegrationStatus = {
  id: string;
  label: string;
  category: string;
  state: IntegrationState;
  detail: string;
  checkedAt: string;
};

const configured = (...keys: string[]) => keys.every(key => Boolean(process.env[key]?.trim()));

export async function getIntegrationStatuses(): Promise<IntegrationStatus[]> {
  const checkedAt = new Date().toISOString();
  const checks: IntegrationStatus[] = [
    { id: "discord", label: "Discord OAuth", category: "identity", state: configured("DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "DISCORD_REDIRECT_URI") ? "configured" : "missing", detail: "Connexion OAuth et communauté", checkedAt },
    { id: "tmdb", label: "TMDB", category: "metadata", state: configured("TMDB_API_KEY") || configured("TMDB_READ_ACCESS_TOKEN") ? "configured" : "missing", detail: "Recherche et métadonnées films/séries", checkedAt },
    { id: "stripe", label: "Stripe", category: "payments", state: configured("STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET") ? "configured" : "missing", detail: "Paiements, abonnements et webhooks", checkedAt },
    { id: "email", label: "Resend", category: "email", state: configured("RESEND_API_KEY", "EMAIL_FROM") ? "configured" : "missing", detail: "E-mails transactionnels", checkedAt },
    { id: "storage", label: "S3 / Cloudflare R2", category: "storage", state: configured("S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY") ? "configured" : "missing", detail: "Affiches, avatars et fichiers", checkedAt },
    { id: "redis", label: "Redis", category: "realtime", state: configured("REDIS_URL") ? "configured" : "missing", detail: "Cache, files de tâches et présence distribuée", checkedAt },
    { id: "sentry", label: "Sentry", category: "observability", state: configured("SENTRY_DSN") ? "configured" : "missing", detail: "Suivi des erreurs et performances", checkedAt },
    { id: "posthog", label: "PostHog", category: "analytics", state: configured("POSTHOG_KEY", "POSTHOG_HOST") ? "configured" : "missing", detail: "Mesure d'audience respectueuse du consentement", checkedAt },
    { id: "database", label: "PostgreSQL", category: "core", state: "connected", detail: "Base principale", checkedAt }
  ];

  const tmdbKey = process.env.TMDB_READ_ACCESS_TOKEN;
  const tmdbApiKey = process.env.TMDB_API_KEY;
  if (tmdbKey || tmdbApiKey) {
    try {
      const response = await fetch("https://api.themoviedb.org/3/configuration", {
        headers: tmdbKey ? { Authorization: "Bearer " + tmdbKey, accept: "application/json" } : { accept: "application/json" , "x-api-key": tmdbApiKey! },
        signal: AbortSignal.timeout(5000)
      });
      const item = checks.find(x => x.id === "tmdb")!;
      item.state = response.ok ? "connected" : "error";
      item.detail = response.ok ? "API accessible · métadonnées disponibles" : "Clé refusée ou API indisponible";
    } catch {
      const item = checks.find(x => x.id === "tmdb")!;
      item.state = "error";
      item.detail = "Impossible de joindre TMDB";
    }
  }

  return checks;
}

export function verifyStripeSignature(rawBody: Buffer, signatureHeader: string, secret: string): boolean {
  const parts = signatureHeader.split(",").map(part => part.split("=", 2));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || !/^\d+$/.test(timestamp) || !signatures.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = Buffer.from(
    (awaitlessHmac(timestamp, rawBody, secret)),
    "hex"
  );
  return signatures.some(candidate => {
    if (!/^[a-f0-9]{64}$/i.test(candidate)) return false;
    const actual = Buffer.from(candidate, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
}

function awaitlessHmac(timestamp: string, body: Buffer, secret: string): string {
  const { createHmac } = requireCrypto();
  return createHmac("sha256", secret).update(timestamp + ".").update(body).digest("hex");
}

function requireCrypto() {
  return { createHmac: (awaitImportCrypto as unknown as (name: string) => typeof import("node:crypto").createHmac)("node:crypto") };
}
