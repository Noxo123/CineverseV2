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
    const versionSix = await client.query("SELECT version FROM schema_migrations WHERE version = 6");
    if (versionSix.rowCount === 0) {
      await client.query("BEGIN");
      try {
        await client.query(`
          CREATE TABLE legacy_discord_users (
            id bigint PRIMARY KEY,
            discord_user_id text NOT NULL UNIQUE,
            linked_account_id uuid REFERENCES users(id) ON DELETE SET NULL,
            created_at timestamptz NOT NULL DEFAULT now()
          );
          CREATE TABLE legacy_discord_servers (
            id bigint PRIMARY KEY,
            discord_guild_id text NOT NULL UNIQUE,
            name text NOT NULL,
            status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
            created_at timestamptz NOT NULL DEFAULT now()
          );
          CREATE TABLE legacy_server_memberships (
            server_id bigint NOT NULL REFERENCES legacy_discord_servers(id) ON DELETE CASCADE,
            legacy_user_id bigint NOT NULL REFERENCES legacy_discord_users(id) ON DELETE CASCADE,
            joined_at timestamptz NOT NULL DEFAULT now(),
            status text NOT NULL DEFAULT 'active',
            PRIMARY KEY(server_id,legacy_user_id)
          );
          CREATE TABLE legacy_server_settings (
            server_id bigint NOT NULL REFERENCES legacy_discord_servers(id) ON DELETE CASCADE,
            key text NOT NULL,
            value text NOT NULL,
            updated_at timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY(server_id,key)
          );
          CREATE TABLE legacy_server_permissions (
            server_id bigint NOT NULL REFERENCES legacy_discord_servers(id) ON DELETE CASCADE,
            legacy_user_id bigint NOT NULL REFERENCES legacy_discord_users(id) ON DELETE CASCADE,
            permission text NOT NULL,
            granted_by text NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY(server_id,legacy_user_id,permission)
          );
          CREATE TABLE legacy_polls (
            id bigint PRIMARY KEY,
            scope text NOT NULL CHECK(scope IN ('server','global')),
            owner_server_id bigint REFERENCES legacy_discord_servers(id) ON DELETE CASCADE,
            title text NOT NULL,
            status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','scheduled','active','completed','cancelled')),
            starts_at timestamptz NOT NULL,
            ends_at timestamptz NOT NULL,
            created_by text NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            CHECK ((scope='global' AND owner_server_id IS NULL) OR (scope='server' AND owner_server_id IS NOT NULL))
          );
          CREATE TABLE legacy_poll_servers (
            poll_id bigint NOT NULL REFERENCES legacy_polls(id) ON DELETE CASCADE,
            server_id bigint NOT NULL REFERENCES legacy_discord_servers(id) ON DELETE CASCADE,
            channel_id text,
            message_id text,
            PRIMARY KEY(poll_id,server_id)
          );
          CREATE TABLE legacy_poll_options (
            id bigint PRIMARY KEY,
            poll_id bigint NOT NULL REFERENCES legacy_polls(id) ON DELETE CASCADE,
            title text NOT NULL,
            source_url text,
            position integer NOT NULL CHECK(position BETWEEN 1 AND 4),
            UNIQUE(poll_id,position)
          );
          CREATE TABLE legacy_votes (
            id bigint PRIMARY KEY,
            poll_id bigint NOT NULL REFERENCES legacy_polls(id) ON DELETE CASCADE,
            legacy_user_id bigint NOT NULL REFERENCES legacy_discord_users(id) ON DELETE CASCADE,
            option_id bigint NOT NULL REFERENCES legacy_poll_options(id) ON DELETE CASCADE,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            UNIQUE(poll_id,legacy_user_id)
          );
          CREATE TABLE legacy_film_links (
            id bigint PRIMARYPRIMARY KEY,
            legacy_film_id bigint NOT NULL,
            submitted_by text NOT NULL,
            url text NOT NULL,
            verification_status text NOT NULL DEFAULT 'pending' CHECK(verification_status IN ('pending','approved','rejected')),
            created_at timestamptz NOT NULL DEFAULT now()
          );
          CREATE TABLE legacy_watch_parties (
            id bigint PRIMARY KEY,
            legacy_film_id bigint NOT NULL,
            scope text NOT NULL CHECK(scope IN ('server','global')),
            status text NOT NULL DEFAULT 'scheduled' CHECK(status IN ('draft','scheduled','active','completed','cancelled')),
            scheduled_at timestamptz NOT NULL,
            started_at timestamptz,
            ended_at timestamptz,
            created_by text NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now()
          );
          CREATE TABLE legacy_watch_party_servers (
            party_id bigint NOT NULL REFERENCES legacy_watch_parties(id) ON DELETE CASCADE,
            server_id bigint NOT NULL REFERENCES legacy_discord_servers(id) ON DELETE CASCADE,
            voice_channel_id text,
            announcement_message_id text,
            PRIMARY KEY(party_id,server_id)
          );
          CREATE TABLE legacy_watch_party_presence (
            party_id bigint NOT NULL REFERENCES legacy_watch_parties(id) ON DELETE CASCADE,
            server_id bigint NOT NULL REFERENCES legacy_discord_servers(id) ON DELETE CASCADE,
            legacy_user_id bigint NOT NULL REFERENCES legacy_discord_users(id) ON DELETE CASCADE,
            first_seen_at timestamptz NOT NULL,
            last_seen_at timestamptz NOT NULL,
            duration_seconds integer NOT NULL DEFAULT 0 CHECK(duration_seconds>=0),
            PRIMARY KEY(party_id,server_id,legacy_user_id)
          );
          CREATE TABLE legacy_watch_party_playback (
            party_id bigint PRIMARY KEY REFERENCES legacy_watch_parties(id) ON DELETE CASCADE,
            position_seconds double precision NOT NULL DEFAULT 0 CHECK(position_seconds>=0),
            is_playing boolean NOT NULL DEFAULT false,
            updated_at timestamptz NOT NULL DEFAULT now()
          );
          CREATE TABLE legacy_vip_entitlements (
            id bigint PRIMARY KEY,
            legacy_user_id bigint NOT NULL REFERENCES legacy_discord_users(id) ON DELETE CASCADE,
            scope text NOT NULL CHECK(scope IN ('server','global')),
            server_id bigint REFERENCES legacy_discord_servers(id) ON DELETE CASCADE,
            vip_tier text NOT NULL DEFAULT 'vip',
            source text NOT NULL CHECK(source IN ('gift','giveaway','admin','paid')),
            starts_at timestamptz NOT NULL,
            expires_at timestamptz,
            status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','expired','revoked')),
            created_by text NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            CHECK ((scope='global' AND server_id IS NULL) OR (scope='server' AND server_id IS NOT NULL))
          );
          CREATE TABLE legacy_vip_role_mappings (
            server_id bigint NOT NULL REFERENCES legacy_discord_servers(id) ON DELETE CASCADE,
            vip_tier text NOT NULL,
            discord_role_id text NOT NULL,
            PRIMARY KEY(server_id,vip_tier)
          );
          CREATE TABLE legacy_giveaways (
            id bigint PRIMARY KEY,
            scope text NOT NULL CHECK(scope IN ('server','global')),
            server_id bigint REFERENCES legacy_discord_servers(id) ON DELETE CASCADE,
            title text NOT NULL,
            reward_type text NOT NULL,
            reward_value text NOT NULL,
            ends_at timestamptz NOT NULL,
            status text NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','active','completed','cancelled')),
            created_by text NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            CHECK ((scope='global' AND server_id IS NULL) OR (scope='server' AND server_id IS NOT NULL))
          );
          CREATE TABLE legacy_giveaway_entries (
            giveaway_id bigint NOT NULL REFERENCES legacy_giveaways(id) ON DELETE CASCADE,
            legacy_user_id bigint NOT NULL REFERENCES legacy_discord_users(id) ON DELETE CASCADE,
            server_id bigint REFERENCES legacy_discord_servers(id) ON DELETE CASCADE,
            entered_at timestamptz NOT NULL DEFAULT now(),
            eligibility_status text NOT NULL DEFAULT 'eligible',
            PRIMARY KEY(giveaway_id,legacy_user_id)
          );
          CREATE TABLE legacy_giveaway_winners (
            giveaway_id bigint NOT NULL REFERENCES legacy_giveaways(id) ON DELETE CASCADE,
            legacy_user_id bigint NOT NULL REFERENCES legacy_discord_users(id) ON DELETE CASCADE,
            reward_status text NOT NULL DEFAULT 'pending',
            selected_at timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY(giveaway_id,legacy_user_id)
          );
          CREATE TABLE legacy_ad_campaigns (
            id bigint PRIMARYPRIMARY KEY,
            owner_server_id bigint REFERENCES legacy_discord_servers(id) ON DELETE CASCADE,
            advertiser text NOT NULL,
            title text NOT NULL,
            target_url text NOT NULL,
            media_url text,
            placement text NOT NULL DEFAULT 'preshow',
            starts_at timestamptz NOT NULL,
            ends_at timestamptz NOT NULL,
            status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','scheduled','active','completed','paused')),
            created_at timestamptz NOT NULL DEFAULT now()
          );
          CREATE TABLE legacy_ad_campaign_servers (
            campaign_id bigint NOT NULL REFERENCES legacy_ad_campaigns(id) ON DELETE CASCADE,
            server_id bigint NOT NULL REFERENCES legacy_discord_servers(id) ON DELETE CASCADE,
            PRIMARY KEY(campaign_id,server_id)
          );
          CREATE TABLE legacy_ad_events (
            id bigint PRIMARY KEY,
            campaign_id bigint NOT NULL REFERENCES legacy_ad_campaigns(id) ON DELETE CASCADE,
            server_id bigint REFERENCES legacy_discord_servers(id) ON DELETE SET NULL,
            party_id bigint REFERENCES legacy_watch_parties(id) ON DELETE SET NULL,
            event_type text NOT NULL CHECK(event_type IN ('publication','impression_estimate','click','verified_view')),
            created_at timestamptz NOT NULL DEFAULT now()
          );
          CREATE TABLE legacy_scheduled_jobs (
            id bigint PRIMARY KEY,
            job_type text NOT NULL,
            payload jsonb NOT NULL DEFAULT '{}',
            run_at timestamptz NOT NULL,
            status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed')),
            attempts integer NOT NULL DEFAULT 0,
            created_at timestamptz NOT NULL DEFAULT now()
          );
          CREATE TABLE legacy_film_comments (
            id bigint PRIMARY KEY,
            legacy_film_id bigint NOT NULL,
            legacy_user_id bigint NOT NULL REFERENCES legacy_discord_users(id) ON DELETE CASCADE,
            content text NOT NULL CHECK(length(content) BETWEEN 1 AND 1000),
            created_at timestamptz NOT NULL DEFAULT now()
          );
          CREATE TABLE legacy_film_reviews (
            id bigint PRIMARY KEY,
            legacy_film_id bigint NOT NULL,
            legacy_user_id bigint NOT NULL REFERENCES legacy_discord_users(id) ON DELETE CASCADE,
            rating integer NOT NULL CHECK(rating BETWEEN 1 AND 5),
            updated_at timestamptz NOT NULL DEFAULT now(),
            UNIQUE(legacy_film_id,legacy_user_id)
          );
          CREATE TABLE legacy_film_reports (
            id bigint PRIMARY KEY,
            legacy_film_id bigint NOT NULL,
            legacy_user_id bigint NOT NULL REFERENCES legacy_discord_users(id) ON DELETE CASCADE,
            category text NOT NULL,
            details text NOT NULL DEFAULT '',
            status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewing','resolved','dismissed')),
            created_at timestamptz NOT NULL DEFAULT now()
          );
          CREATE TABLE legacy_watch_chat_messages (
            id bigint PRIMARY KEY,
            party_id bigint NOT NULL REFERENCES legacy_watch_parties(id) ON DELETE CASCADE,
            discord_user_id text NOT NULL,
            content text NOT NULL CHECK(length(content) BETWEEN 1 AND 500),
            created_at timestamptz NOT NULL DEFAULT now()
          );
          CREATE TABLE legacy_watch_presence (
            party_id bigint NOT NULL REFERENCES legacy_watch_parties(id) ON DELETE CASCADE,
            discord_user_id text NOT NULL,
            first_seen_at timestamptz NOT NULL,
            last_seen_at timestamptz NOT NULL,
            PRIMARY KEY(party_id,discord_user_id)
          );
          CREATE TABLE legacy_bot_presence_config (
            id integer PRIMARYPRIMARY KEY CHECK(id=1),
            legacy_film_id bigint,
            activity_text text NOT NULL DEFAULT '',
            activity_type text NOT NULL DEFAULT 'custom',
            activity_url text NOT NULL DEFAULT '',
            status text NOT NULL DEFAULT 'online' CHECK(status IN ('online','idle','dnd','invisible')),
            updated_at timestamptz NOT NULL DEFAULT now()
          );
          CREATE TABLE legacy_admin_webhooks (
            id text PRIMARY KEY,
            name text NOT NULL,
            purpose text NOT NULL DEFAULT 'Custom',
            encrypted_url text NOT NULL,
            iv text,
            auth_tag text,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
          );
          CREATE INDEX legacy_memberships_user_idx ON legacy_server_memberships(legacy_user_id);
          CREATE INDEX legacy_watch_parties_status_idx ON legacy_watch_parties(status,scheduled_at);
          CREATE INDEX legacy_vip_expiry_idx ON legacy_vip_entitlements(status,expires_at);
          CREATE INDEX legacy_ad_events_campaign_idx ON legacy_ad_events(campaign_id,event_type,created_at);
          CREATE INDEX legacy_jobs_due_idx ON legacy_scheduled_jobs(status,run_at);
          CREATE INDEX legacy_film_comments_recent_idx ON legacy_film_comments(legacy_film_id,created_at DESC,id DESC);
          CREATE INDEX legacy_film_reports_status_idx ON legacy_film_reports(status,created_at DESC);
          CREATE INDEX legacy_watch_chat_recent_idx ON legacy_watch_chat_messages(party_id,id DESC);
          CREATE INDEX legacy_watch_presence_recent_idx ON legacy_watch_presence(party_id,last_seen_at DESC);
          
          INSERT INTO schema_migrations(version) VALUES (6);
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
