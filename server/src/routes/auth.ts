import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { getDb } from "../db/client.js";
import { organizationMembers, organizations, users } from "../db/schema.js";
import {
  clearSessionCookie,
  createSession,
  getUserFromSession,
  hashPassword,
  setSessionCookie,
  verifyPassword,
} from "../lib/auth.js";
import { createId, slugify } from "../lib/crypto.js";

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export const authRoutes = new Hono();

authRoutes.post("/register", async (c) => {
  const body = await c.req.json<{
    email?: string;
    password?: string;
    displayName?: string;
  }>();

  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  const displayName = body.displayName?.trim() || email.split("@")[0] || "User";

  if (!isEmail(email)) {
    return c.json({ success: false, error: "Valid email is required" }, 400);
  }
  if (password.length < 8) {
    return c.json({ success: false, error: "Password must be at least 8 characters" }, 400);
  }

  const db = getDb();
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing[0]) {
    return c.json({ success: false, error: "Email already registered" }, 409);
  }

  const userId = createId();
  const orgId = createId();
  const orgSlug = `${slugify(displayName)}-${userId.slice(0, 8)}`;
  const now = new Date();

  await db.insert(users).values({
    id: userId,
    email,
    passwordHash: await hashPassword(password),
    displayName,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(organizations).values({
    id: orgId,
    name: `${displayName}'s workspace`,
    slug: orgSlug,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(organizationMembers).values({
    id: createId(),
    organizationId: orgId,
    userId,
    role: "owner",
    createdAt: now,
  });

  const token = await createSession(userId);
  setSessionCookie(c, token);

  return c.json({
    success: true,
    user: { id: userId, email, displayName },
    organizationId: orgId,
  });
});

authRoutes.post("/login", async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>();
  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";

  if (!email || !password) {
    return c.json({ success: false, error: "Email and password are required" }, 400);
  }

  const db = getDb();
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return c.json({ success: false, error: "Invalid email or password" }, 401);
  }

  const token = await createSession(user.id);
  setSessionCookie(c, token);

  return c.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    },
  });
});

authRoutes.post("/logout", async (c) => {
  clearSessionCookie(c);
  return c.json({ success: true });
});

authRoutes.get("/me", async (c) => {
  const user = await getUserFromSession(c);
  if (!user) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }
  return c.json({ success: true, user });
});
