import { createHash } from "node:crypto";
import { getDb } from "@/lib/db";

export function stableCacheKey(prefix: string, value: unknown) {
  return `${prefix}:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

export function getJsonCache<T>(table: "search_cache", key: string): T | null {
  const row = getDb()
    .prepare(`SELECT value FROM ${table} WHERE cache_key = ? AND expires_at > ?`)
    .get(key, Date.now()) as { value: string } | undefined;
  return row ? (JSON.parse(row.value) as T) : null;
}

export function setJsonCache(table: "search_cache", key: string, value: unknown, ttlMs: number) {
  getDb()
    .prepare(`
      INSERT INTO ${table} (cache_key, value, expires_at, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE
      SET value = excluded.value, expires_at = excluded.expires_at
    `)
    .run(key, JSON.stringify(value), Date.now() + ttlMs, Date.now());
}
