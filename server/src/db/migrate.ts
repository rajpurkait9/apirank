import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ensureDatabaseReady, getDatabaseMode, getDb } from "./client.js";

function migrationsDir(): string {
  return join(import.meta.dir, "../../../database/migrations");
}

async function applyWithPglite(): Promise<void> {
  const { mkdirSync } = await import("node:fs");
  const { PGlite } = await import("@electric-sql/pglite");
  const dataDir = process.env.PGLITE_DATA_DIR ?? join(process.cwd(), ".data", "apirank");
  mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  await client.waitReady;

  await client.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const files = readdirSync(migrationsDir())
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const existing = await client.query<{ filename: string }>(
      "SELECT filename FROM schema_migrations WHERE filename = $1",
      [file],
    );
    if (existing.rows.length > 0) {
      console.log(`skip ${file}`);
      continue;
    }

    const contents = readFileSync(join(migrationsDir(), file), "utf8");
    await client.exec(contents);
    await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
    console.log(`applied ${file}`);
  }

  await client.close();
}

async function applyWithPostgres(): Promise<void> {
  const postgres = (await import("postgres")).default;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for postgres migrations");
  }

  const sql = postgres(databaseUrl, { max: 1 });
  const files = readdirSync(migrationsDir())
    .filter((name) => name.endsWith(".sql"))
    .sort();

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    for (const file of files) {
      const applied = await sql<{ filename: string }[]>`
        SELECT filename FROM schema_migrations WHERE filename = ${file}
      `;
      if (applied.length > 0) {
        console.log(`skip ${file}`);
        continue;
      }

      const contents = readFileSync(join(migrationsDir(), file), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(contents);
        await tx`INSERT INTO schema_migrations (filename) VALUES (${file})`;
      });
      console.log(`applied ${file}`);
    }
  } finally {
    await sql.end();
  }
}

export async function runMigrations(): Promise<void> {
  if (getDatabaseMode() === "postgres") {
    await applyWithPostgres();
  } else {
    await applyWithPglite();
  }
}

if (import.meta.main) {
  await runMigrations();
  // Touch drizzle connection so paths are validated.
  await ensureDatabaseReady();
  getDb();
  console.log("Migrations complete.");
}
