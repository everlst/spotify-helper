import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { dataPath } from "@/lib/paths";

const KEY_BYTES = 32;

function getMasterKey() {
  const keyFile = dataPath("secret.key");

  if (!existsSync(keyFile)) {
    const key = randomBytes(KEY_BYTES).toString("hex");
    writeFileSync(keyFile, key, { mode: 0o600 });
    chmodSync(keyFile, 0o600);
    return Buffer.from(key, "hex");
  }

  const raw = readFileSync(keyFile, "utf8").trim();
  const key = Buffer.from(raw, "hex");
  if (key.length !== KEY_BYTES) {
    throw new Error("Invalid DATA_DIR secret.key length");
  }
  return key;
}

export function encryptString(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getMasterKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptString(value: string) {
  const [ivRaw, tagRaw, encryptedRaw] = value.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Invalid encrypted value format");
  }

  const decipher = createDecipheriv("aes-256-gcm", getMasterKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final()
  ]).toString("utf8");
}
