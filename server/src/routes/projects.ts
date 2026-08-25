import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { getDb } from "../db/client.js";
import { apiKeys, organizationMembers, projects, slowRequests } from "../db/schema.js";
import { requireUser, userCanAccessProject } from "../lib/auth.js";
import { createApiKeyPlaintext, createId, slugify } from "../lib/crypto.js";

export const projectRoutes = new Hono();

projectRoutes.get("/", async (c) => {
  const auth = await requireUser(c);
  if (!auth.ok) {
    return auth.response;
  }

  const db = getDb();
  const rows = await db
    .select({
      id: projects.id,
      organizationId: projects.organizationId,
      name: projects.name,
      slug: projects.slug,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .innerJoin(organizationMembers, eq(organizationMembers.organizationId, projects.organizationId))
    .where(eq(organizationMembers.userId, auth.user.id))
    .orderBy(desc(projects.createdAt));

  return c.json({
    success: true,
    projects: rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
  });
});

projectRoutes.post("/", async (c) => {
  const auth = await requireUser(c);
  if (!auth.ok) {
    return auth.response;
  }

  const body = await c.req.json<{ name?: string }>();
  const name = body.name?.trim() ?? "";
  if (!name) {
    return c.json({ success: false, error: "Project name is required" }, 400);
  }

  const db = getDb();
  const memberships = await db
    .select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, auth.user.id))
    .limit(1);

  const membership = memberships[0];
  if (!membership) {
    return c.json({ success: false, error: "No organization found for user" }, 400);
  }

  const projectId = createId();
  const slug = `${slugify(name)}-${projectId.slice(0, 6)}`;
  const now = new Date();

  await db.insert(projects).values({
    id: projectId,
    organizationId: membership.organizationId,
    name,
    slug,
    createdAt: now,
    updatedAt: now,
  });

  const key = createApiKeyPlaintext();
  await db.insert(apiKeys).values({
    id: createId(),
    projectId,
    name: "Default",
    prefix: key.prefix,
    keyHash: key.keyHash,
    createdAt: now,
  });

  return c.json({
    success: true,
    project: {
      id: projectId,
      organizationId: membership.organizationId,
      name,
      slug,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    apiKey: {
      plaintext: key.plaintext,
      prefix: key.prefix,
    },
  });
});

projectRoutes.post("/:projectId/keys", async (c) => {
  const auth = await requireUser(c);
  if (!auth.ok) {
    return auth.response;
  }

  const projectId = c.req.param("projectId");
  if (!(await userCanAccessProject(auth.user.id, projectId))) {
    return c.json({ success: false, error: "Project not found" }, 404);
  }

  const body = await c.req.json<{ name?: string }>().catch(() => ({ name: "Default" }));
  const name = body.name?.trim() || "Default";
  const key = createApiKeyPlaintext();
  const now = new Date();
  const db = getDb();

  await db.insert(apiKeys).values({
    id: createId(),
    projectId,
    name,
    prefix: key.prefix,
    keyHash: key.keyHash,
    createdAt: now,
  });

  return c.json({
    success: true,
    apiKey: {
      plaintext: key.plaintext,
      prefix: key.prefix,
      name,
      createdAt: now.toISOString(),
    },
  });
});

projectRoutes.get("/:projectId/slow-requests", async (c) => {
  const auth = await requireUser(c);
  if (!auth.ok) {
    return auth.response;
  }

  const projectId = c.req.param("projectId");
  if (!(await userCanAccessProject(auth.user.id, projectId))) {
    return c.json({ success: false, error: "Project not found" }, 404);
  }

  const limitRaw = Number(c.req.query("limit") ?? 100);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 100;

  const db = getDb();
  const rows = await db
    .select()
    .from(slowRequests)
    .where(eq(slowRequests.projectId, projectId))
    .orderBy(desc(slowRequests.occurredAt))
    .limit(limit);

  return c.json({
    success: true,
    slowRequests: rows.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      method: row.method,
      path: row.path,
      statusCode: row.statusCode,
      durationMs: row.durationMs,
      thresholdMs: row.thresholdMs,
      startedAt: row.startedAt.toISOString(),
      occurredAt: row.occurredAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    })),
  });
});

projectRoutes.get("/:projectId", async (c) => {
  const auth = await requireUser(c);
  if (!auth.ok) {
    return auth.response;
  }

  const projectId = c.req.param("projectId");
  if (!(await userCanAccessProject(auth.user.id, projectId))) {
    return c.json({ success: false, error: "Project not found" }, 404);
  }

  const db = getDb();
  const rows = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  const project = rows[0];
  if (!project) {
    return c.json({ success: false, error: "Project not found" }, 404);
  }

  const keys = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.projectId, projectId)))
    .orderBy(desc(apiKeys.createdAt));

  return c.json({
    success: true,
    project: {
      id: project.id,
      organizationId: project.organizationId,
      name: project.name,
      slug: project.slug,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    },
    apiKeys: keys.map((key) => ({
      id: key.id,
      name: key.name,
      prefix: key.prefix,
      createdAt: key.createdAt.toISOString(),
      lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
      status: key.revokedAt ? "revoked" : "active",
    })),
  });
});
