import pg from "pg";
import { env, superAdminEmails } from "./env.js";

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
    const versionTwo = await client.query("SELECT version FROM schema_migrations WHERE version = 2");
    if (versionTwo.rowCount === 0) {
      await client.query("BEGIN");
      try {
        await client.query(`
          CREATE TABLE roles (
            id text PRIMARY KEY,
            label text NOT NULL,
            permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
            is_global boolean NOT NULL DEFAULT false
          );
          CREATE TABLE user_roles (
            user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role_id text NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
            assigned_at timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY(user_id, role_id)
          );
          CREATE TABLE audit_logs (
            id uuid PRIMARY KEY,
            actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            action text NOT NULL,
            target_type text,
            target_id text,
            metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
            created_at timestamptz NOT NULL DEFAULT now()
          );
          CREATE INDEX audit_logs_created_idx ON audit_logs(created_at DESC);
          INSERT INTO roles(id,label,permissions,is_global) VALUES
            ('super_admin','Super administrateur','["*"]'::jsonb,true),
            ('admin','Administrateur','["dashboard.read","catalog.read","catalog.write","users.read","users.moderate","vip.read","vip.write","ads.read","ads.write","integrations.read","monitoring.read"]'::jsonb,true);
          INSERT INTO user_roles(user_id,role_id)
            SELECT id,'super_admin' FROM users
            WHERE lower(email)=ANY($1::text[])
            ON CONFLICT DO NOTHING;
          INSERT INTO schema_migrations(version) VALUES (2);
        `, [superAdminEmails]);
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
