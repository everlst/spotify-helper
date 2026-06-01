import { getDb } from "@/lib/db";
import type { ArtistEnrichment } from "@/lib/codex";

const ARTIST_TTL_MS = 1000 * 60 * 60 * 24 * 14;

export function getArtistEnrichmentCache(spotifyArtistId: string) {
  const row = getDb()
    .prepare(`
      SELECT value FROM artist_enrichment_cache
      WHERE spotify_artist_id = ? AND expires_at > ?
    `)
    .get(spotifyArtistId, Date.now()) as { value: string } | undefined;
  return row ? (JSON.parse(row.value) as ArtistEnrichment) : null;
}

export function setArtistEnrichmentCache(spotifyArtistId: string, artistName: string, value: ArtistEnrichment) {
  getDb()
    .prepare(`
      INSERT INTO artist_enrichment_cache (spotify_artist_id, artist_name, value, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(spotify_artist_id) DO UPDATE
      SET artist_name = excluded.artist_name,
          value = excluded.value,
          expires_at = excluded.expires_at
    `)
    .run(spotifyArtistId, artistName, JSON.stringify(value), Date.now() + ARTIST_TTL_MS, Date.now());
}
