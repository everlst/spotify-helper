import Database from "better-sqlite3";
import { dataPath } from "@/lib/paths";

let db: Database.Database | null = null;

export function getDb() {
  if (db) {
    return db;
  }

  db = new Database(dataPath("spotify-helper.sqlite"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS secure_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS oauth_states (
      state TEXT PRIMARY KEY,
      code_verifier TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS search_cache (
      cache_key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS artist_enrichment_cache (
      spotify_artist_id TEXT PRIMARY KEY,
      artist_name TEXT NOT NULL,
      value TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS playlist_additions (
      spotify_uri TEXT NOT NULL,
      playlist_id TEXT NOT NULL,
      snapshot_id TEXT,
      added_at INTEGER NOT NULL,
      PRIMARY KEY (spotify_uri, playlist_id)
    );
  `);
}

export function getSetting(key: string) {
  const row = getDb()
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string) {
  getDb()
    .prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `)
    .run(key, value);
}

export function deleteSetting(key: string) {
  getDb().prepare("DELETE FROM settings WHERE key = ?").run(key);
}

export function getSecureSetting(key: string) {
  const row = getDb()
    .prepare("SELECT value FROM secure_settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSecureSetting(key: string, value: string) {
  getDb()
    .prepare(`
      INSERT INTO secure_settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `)
    .run(key, value);
}

export function deleteSecureSetting(key: string) {
  getDb().prepare("DELETE FROM secure_settings WHERE key = ?").run(key);
}

export function deleteExpiredRows() {
  const now = Date.now();
  const database = getDb();
  database.prepare("DELETE FROM oauth_states WHERE created_at < ?").run(now - 10 * 60 * 1000);
  database.prepare("DELETE FROM search_cache WHERE expires_at < ?").run(now);
  database.prepare("DELETE FROM artist_enrichment_cache WHERE expires_at < ?").run(now);
}
