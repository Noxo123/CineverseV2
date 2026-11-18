import pg from "pg";
import { env } from "./env.js";

export const db = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 12,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: env.NODE_ENV === "production" ? { rejectUnauthorized: true } : undefined
});

export async function migrate() {
  const client = await db.connect();
  try {
    await client.query("SELECT pg_advisory_lock(72819402)");
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version integer PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    const existing = await client.query("SELECT version FROM schema_migrations WHERE version = 1");
    if (existing.rowCount === 0) {
      await client.query("BEGIN");
      try {
        await client.query(`
          CREATE TABLE users (
            id uuid PRIMARY KEY,
            email text NOT NULL,
            password_hash text NOT NULL,
            email_verified_at timestamptz,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
          );
          CREATE UNIQUE INDEX users_email_lower_unique ON users (lower(email));
          CREATE TABLE profiles (
            id uuid PRIMARY KEY,
            account_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name varchar(24) NOT NULL,
            avatar_key text NOT NULL DEFAULT 'coral',
            is_kids boolean NOT NULL DEFAULT false,
            pin_hash text,
            last_seen_at timestamptz,
            online_until timestamptz,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
          );
          CREATE INDEX profiles_account_idx ON profiles(account_id);
          CREATE INDEX profiles_presence_idx ON profiles(online_until);
          CREATE TABLE sessions (
            id uuid PRIMARY KEY,
            user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token_hash char(64) NOT NULL UNIQUE,
            expires_at timestamptz NOT NULL,
            revoked_at timestamptz,
            user_agent text,
            created_at timestamptz NOT NULL DEFAULT now()
          );
          CREATE INDEX sessions_user_idx ON sessions(user_id);
          INSERT INTO schema_migrations(version) VALUES (1);
        `);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(72819402)");
    client.release();
  }
}
