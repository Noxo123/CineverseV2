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
          INSERT INTO schema_migrations(version) VALUES (2);
        `);
        await client.query(
          "INSERT INTO user_roles(user_id,role_id) SELECT id,$2 FROM users WHERE lower(email)=ANY($1::text[]) ON CONFLICT DO NOTHING",
          [superAdminEmails, "super_admin"]
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    const versionThree = await client.query("SELECT version FROM schema_migrations WHERE version = 3");
    if (versionThree.rowCount === 0) {
      await client.query("BEGIN");
      try {
        await client.query(`
          ALTER TABLE profiles ADD COLUMN is_primary boolean NOT NULL DEFAULT false;
          UPDATE profiles p SET is_primary=true
          WHERE p.id = (
            SELECT first_profile.id FROM profiles first_profile
            WHERE first_profile.account_id=p.account_id
            ORDER BY first_profile.created_at, first_profile.id
            LIMIT 1
          );
          CREATE UNIQUE INDEX profiles_one_primary_per_account
            ON profiles(account_id) WHERE is_primary=true;
          INSERT INTO schema_migrations(version) VALUES (3);
        `);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    const versionFour = await client.query("SELECT version FROM schema_migrations WHERE version = 4");
    if (versionFour.rowCount === 0) {
      await client.query("BEGIN");
      try {
        await client.query(`
          CREATE TABLE catalog_items (
            id uuid PRIMARY KEY,
            content_type text NOT NULL CHECK (content_type IN ('movie','tv')),
            title varchar(240) NOT NULL,
            synopsis text,
            release_year integer CHECK (release_year BETWEEN 1888 AND 2100),
            poster_url text,
            tmdb_id integer,
            publication_status text NOT NULL DEFAULT 'draft' CHECK (publication_status IN ('draft','published','archived')),
            rights_status text NOT NULL DEFAULT 'pending' CHECK (rights_status IN ('pending','verified','rejected')),
            rights_reference text,
            rights_expires_at timestamptz,
            created_by uuid REFERENCES users(id) ON DELETE SET NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            published_at timestamptz
          );
          CREATE UNIQUE INDEX catalog_items_tmdb_unique ON catalog_items(tmdb_id) WHERE tmdb_id IS NOT NULL;
          CREATE INDEX catalog_items_public_idx ON catalog_items(publication_status, content_type, title);
          INSERT INTO schema_migrations(version) VALUES (4);
        `);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    const versionFive = await client.query("SELECT version FROM schema_migrations WHERE version = 5");
    if (versionFive.rowCount === 0) {
      await client.query("BEGIN");
      try {
        await client.query(`
          CREATE TABLE oauth_accounts (
            id uuid PRIMARY KEY,
            user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            provider text NOT NULL,
            provider_user_id text NOT NULL,
            provider_email text,
            created_at timestamptz NOT NULL DEFAULT now(),
            UNIQUE(provider, provider_user_id),
            UNIQUE(user_id, provider)
          );
          CREATE INDEX oauth_accounts_user_idx ON oauth_accounts(user_id);
          CREATE TABLE stripe_webhook_events (
            id text PRIMARY KEY,
            event_type text NOT NULL,
            processed_at timestamptz NOT NULL DEFAULT now()
          );
          CREATE TABLE vip_subscriptions (
            id uuid PRIMARY KEY,
            user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            stripe_customer_id text,
            stripe_subscription_id text UNIQUE,
            stripe_checkout_session_id text UNIQUE,
            price_id text,
            status text NOT NULL DEFAULT 'pending',
            current_period_end timestamptz,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
          );
          CREATE INDEX vip_subscriptions_user_idx ON vip_subscriptions(user_id, status);
          INSERT INTO schema_migrations(version) VALUES (5);
        `);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    if (superAdminEmails.length) await client.query("INSERT INTO user_roles(user_id,role_id) SELECT id,$2 FROM users WHERE lower(email)=ANY($1::text[]) ON CONFLICT DO NOTHING", [superAdminEmails, "super_admin"]);
  } finally {
    await client.query("SELECT pg_advisory_unlock(72819402)");
    client.release();
  }
}
