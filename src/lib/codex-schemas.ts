const citation = {
  type: "object",
  additionalProperties: false,
  required: ["url", "title"],
  properties: {
    title: { type: "string" },
    url: { type: "string" }
  }
} as const;

export const codexSearchSchema = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "target_language", "normalized_query", "candidates", "summary_zh", "citations"],
  properties: {
    intent: { type: "string", enum: ["artist", "track", "mixed", "unknown"] },
    target_language: { type: "string" },
    normalized_query: { type: "string" },
    summary_zh: { type: "string" },
    citations: {
      type: "array",
      items: citation,
      maxItems: 8
    },
    candidates: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "kind",
          "spotify_query",
          "display_name_guess",
          "aliases",
          "related_works",
          "confidence",
          "reason_zh",
          "citations"
        ],
        properties: {
          kind: { type: "string", enum: ["artist", "track"] },
          spotify_query: { type: "string" },
          display_name_guess: { type: "string" },
          aliases: {
            type: "array",
            items: { type: "string" },
            maxItems: 8
          },
          related_works: {
            type: "array",
            items: { type: "string" },
            maxItems: 8
          },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          reason_zh: { type: "string" },
          citations: {
            type: "array",
            items: citation,
            maxItems: 8
          }
        }
      }
    }
  }
} as const;

export const codexArtistEnrichmentSchema = {
  type: "object",
  additionalProperties: false,
  required: ["artist_name", "summary_zh", "aliases", "source_language", "citations"],
  properties: {
    artist_name: { type: "string" },
    summary_zh: { type: "string" },
    aliases: {
      type: "array",
      items: { type: "string" },
      maxItems: 12
    },
    source_language: { type: "string" },
    citations: {
      type: "array",
      items: citation,
      minItems: 1,
      maxItems: 8
    }
  }
} as const;

export const codexCanarySchema = {
  type: "object",
  additionalProperties: false,
  required: ["ok", "web_search_observed", "note_zh", "citations"],
  properties: {
    ok: { type: "boolean" },
    web_search_observed: { type: "boolean" },
    note_zh: { type: "string" },
    citations: {
      type: "array",
      items: citation,
      minItems: 1,
      maxItems: 4
    }
  }
} as const;
