import { mkdirSync } from "node:fs";
import path from "node:path";

export const DATA_DIR =
  process.env.DATA_DIR ?? (process.env.NODE_ENV === "production" ? "/data" : ".data");
export const CODEX_HOME = process.env.CODEX_HOME ?? path.join(/*turbopackIgnore: true*/ DATA_DIR, "codex");

export function ensureRuntimeDirs() {
  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(CODEX_HOME, { recursive: true });
}

export function dataPath(...parts: string[]) {
  ensureRuntimeDirs();
  return path.join(/*turbopackIgnore: true*/ DATA_DIR, ...parts);
}

export function codexPath(...parts: string[]) {
  ensureRuntimeDirs();
  return path.join(/*turbopackIgnore: true*/ CODEX_HOME, ...parts);
}
