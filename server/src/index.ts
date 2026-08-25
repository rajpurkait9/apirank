import { Hono } from "hono";
import { cors } from "hono/cors";
import { ensureDatabaseReady } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { authRoutes } from "./routes/auth.js";
import { ingestRoutes } from "./routes/ingest.js";
import { probeRoutes } from "./routes/probe.js";
import { projectRoutes } from "./routes/projects.js";

const app = new Hono();

const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:5173";

app.use(
  "*",
  cors({
    origin: webOrigin,
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }),
);

app.onError((error, c) => {
  console.error("[apirank-server]", error);
  const message = error instanceof Error ? error.message : "Unexpected server error";
  const isConfig =
    message.includes("DATABASE_URL") ||
    message.includes("connect") ||
    message.includes("ECONNREFUSED");
  return c.json(
    {
      success: false,
      error: isConfig
        ? "Database is not ready. For local dev, restart the server (embedded DB) or set DATABASE_URL."
        : message,
    },
    500,
  );
});

app.get("/health", (c) =>
  c.json({
    success: true,
    service: "apirank-server",
  }),
);

app.route("/v1/auth", authRoutes);
app.route("/v1/projects", projectRoutes);
app.route("/v1/ingest", ingestRoutes);
app.route("/v1/probe", probeRoutes);

export { app };

const port = Number(process.env.PORT ?? 3000);

if (import.meta.main) {
  await runMigrations();
  await ensureDatabaseReady();

  Bun.serve({
    port,
    fetch: app.fetch,
  });
  console.log(`[apirank-server] listening on http://localhost:${port}`);
}
