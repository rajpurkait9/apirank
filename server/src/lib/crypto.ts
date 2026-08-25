import { createHash, randomBytes, randomUUID } from "node:crypto";

export function createId(): string {
  return randomUUID();
}

export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "project";
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export function createApiKeyPlaintext(): { plaintext: string; prefix: string; keyHash: string } {
  const secret = randomBytes(24).toString("hex");
  const plaintext = `ark_${secret}`;
  const prefix = plaintext.slice(0, 12);
  return {
    plaintext,
    prefix,
    keyHash: hashToken(plaintext),
  };
}
