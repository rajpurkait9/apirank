import { Hono } from "hono";
import { getDb } from "../db/client.js";
import { slowRequests } from "../db/schema.js";
import { resolveProjectFromApiKey } from "../lib/auth.js";
import { createId } from "../lib/crypto.js";

export const ingestRoutes = new Hono();

ingestRoutes.post("/requests", async (c) => {
  const auth = await resolveProjectFromApiKey(c.req.header("authorization"));
  if (!auth) {
    return c.json({ success: false, error: "Invalid API key" }, 401);
  }

  const body = await c.req.json<{
    id?: string;
    method?: string;
    path?: string;
    statusCode?: number;
    durationMs?: number;
    thresholdMs?: number;
    startedAt?: string;
    occurredAt?: string;
  }>();

  const method = body.method?.toUpperCase();
  const path = body.path;
  const statusCode = body.statusCode;
  const durationMs = body.durationMs;
  const thresholdMs = body.thresholdMs;
  const startedAt = body.startedAt ? new Date(body.startedAt) : null;
  const occurredAt = body.occurredAt ? new Date(body.occurredAt) : new Date();

  if (
    !method ||
    !path ||
    typeof statusCode !== "number" ||
    typeof durationMs !== "number" ||
    typeof thresholdMs !== "number" ||
    !startedAt ||
    Number.isNaN(startedAt.getTime()) ||
    Number.isNaN(occurredAt.getTime())
  ) {
    return c.json({ success: false, error: "Invalid slow request payload" }, 400);
  }

  const db = getDb();
  const id = body.id && body.id.trim() !== "" ? body.id : createId();

  await db.insert(slowRequests).values({
    id,
    projectId: auth.projectId,
    method,
    path,
    statusCode,
    durationMs,
    thresholdMs,
    startedAt,
    occurredAt,
  });

  return c.json({ success: true, id });
});
