import { and, eq, gt, isNull } from "drizzle-orm";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { getDb } from "../db/client.js";
import { apiKeys, organizationMembers, projects, sessions, users } from "../db/schema.js";
import { createId, createSessionToken, hashToken } from "./crypto.js";

export const SESSION_COOKIE = "apirank_session";
const SESSION_DAYS = 30;

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
};

export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, { algorithm: "bcrypt", cost: 10 });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return Bun.password.verify(password, hash);
}

export async function createSession(userId: string): Promise<string> {
  const db = getDb();
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(sessions).values({
    id: createId(),
    userId,
    tokenHash: hashToken(token),
    expiresAt,
  });

  return token;
}

export function setSessionCookie(c: Context, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

export async function getUserFromSession(c: Context): Promise<AuthUser | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) {
    return null;
  }

  const db = getDb();
  const now = new Date();
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      sessionId: sessions.id,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, now)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
  };
}

export async function requireUser(
  c: Context,
): Promise<{ ok: true; user: AuthUser } | { ok: false; response: Response }> {
  const user = await getUserFromSession(c);
  if (!user) {
    return {
      ok: false,
      response: c.json({ success: false, error: "Unauthorized" }, 401),
    };
  }
  return { ok: true, user };
}

export async function userCanAccessProject(userId: string, projectId: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .innerJoin(organizationMembers, eq(organizationMembers.organizationId, projects.organizationId))
    .where(and(eq(projects.id, projectId), eq(organizationMembers.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

export async function resolveProjectFromApiKey(
  authorizationHeader: string | undefined,
): Promise<{ projectId: string; apiKeyId: string } | null> {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    return null;
  }

  const plaintext = authorizationHeader.slice("Bearer ".length).trim();
  if (!plaintext.startsWith("ark_")) {
    return null;
  }

  const db = getDb();
  const rows = await db
    .select({
      id: apiKeys.id,
      projectId: apiKeys.projectId,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hashToken(plaintext)), isNull(apiKeys.revokedAt)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }

  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id));

  return { projectId: row.projectId, apiKeyId: row.id };
}
