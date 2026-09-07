import { Pool, QueryResultRow } from 'pg';
import { privacy, production, server } from '../config';

const pool = production.databaseUrl
  ? new Pool({ connectionString: production.databaseUrl, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined })
  : null;

export function databaseEnabled(): boolean {
  return pool !== null;
}

export async function query<T extends QueryResultRow>(text: string, values: unknown[] = []): Promise<T[]> {
  if (!pool) throw new Error('Database is not configured');
  const result = await pool.query<T>(text, values);
  return result.rows;
}

export async function initializeDatabase(): Promise<void> {
  if (!pool) {
    if (server.nodeEnv === 'production') throw new Error('DATABASE_URL is required in production');
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id text PRIMARY KEY,
      email text UNIQUE NOT NULL,
      language_default text NOT NULL DEFAULT 'auto',
      history_enabled boolean NOT NULL DEFAULT true,
      drive_discovery jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      last_seen_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS otp_challenges (
      email text PRIMARY KEY,
      code_hash text NOT NULL,
      expires_at timestamptz NOT NULL,
      attempts integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS history_items (
      id text PRIMARY KEY,
      user_id text NOT NULL,
      type text NOT NULL,
      poi_id text,
      place_id text,
      mode text,
      theme text,
      style text,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS history_items_user_created_idx ON history_items(user_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS usage_events (
      id bigserial PRIMARY KEY,
      user_id text,
      category text NOT NULL,
      operation text NOT NULL,
      quantity numeric NOT NULL DEFAULT 1,
      input_tokens integer NOT NULL DEFAULT 0,
      output_tokens integer NOT NULL DEFAULT 0,
      estimated_cost_usd numeric(14,6) NOT NULL DEFAULT 0,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS usage_events_created_idx ON usage_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS usage_events_user_idx ON usage_events(user_id, created_at DESC);
  `);
  await pool.query("DELETE FROM otp_challenges WHERE expires_at < now()");
  await pool.query("DELETE FROM usage_events WHERE created_at < now() - ($1 * interval '1 day')", [privacy.usageRetentionDays]);
}

export async function closeDatabase(): Promise<void> {
  await pool?.end();
}
