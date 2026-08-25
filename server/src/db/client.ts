import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

type AppDatabase =
  | ReturnType<typeof drizzlePglite<typeof schema>>
  | ReturnType<typeof drizzlePostgres<typeof schema>>;

let dbInstance: AppDatabase | null = null;
let pglite: PGlite | null = null;
let postgresClient: ReturnType<typeof postgres> | null = null;
let backend: "pglite" | "postgres" | null = null;

function defaultPglitePath(): string {
  return resolve(process.cwd(), ".data", "apirank");
}

export function getDatabaseMode(): "pglite" | "postgres" {
  const url = process.env.DATABASE_URL?.trim();
  if (url && (url.startsWith("postgres://") || url.startsWith("postgresql://"))) {
    return "postgres";
  }
  return "pglite";
}

export function getDb(): AppDatabase {
  if (dbInstance) {
    return dbInstance;
  }

  if (getDatabaseMode() === "postgres") {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is required for postgres mode");
    }
    postgresClient = postgres(url, { max: 10 });
    dbInstance = drizzlePostgres(postgresClient, { schema });
    backend = "postgres";
    return dbInstance;
  }

  const dataDir = process.env.PGLITE_DATA_DIR
    ? resolve(process.env.PGLITE_DATA_DIR)
    : defaultPglitePath();
  mkdirSync(dataDir, { recursive: true });
  pglite = new PGlite(dataDir);
  dbInstance = drizzlePglite(pglite, { schema });
  backend = "pglite";
  return dbInstance;
}

export async function ensureDatabaseReady(): Promise<void> {
  getDb();
  if (backend === "pglite" && pglite) {
    // PGlite needs an awaitable ready tick before first query.
    await pglite.waitReady;
  }
}

export type Database = AppDatabase;
