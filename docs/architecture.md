# APIRank architecture

APIRank is a Bun workspace with two standalone apps orchestrated by Turborepo.

```
APIRank
    |
    ├── web
    │     └── React + Vite + TanStack Router + TanStack Query + TanStack Store
    |
    └── server
          └── Bun + Hono + Postgres / PGlite (Drizzle)
```

## Applications

### `web`

Dashboard for signup/login, project + API key creation, and browsing slow requests.

### `server`

Cloud API: auth, projects, API keys, and `POST /v1/ingest/requests` for request ingest.

## Dependency graph

```
server → hono, drizzle, pglite/postgres
web    → react, tanstack, vite
```

## Workspace layout extras

- `database/migrations` — SQL schema applied by `bun run db:migrate`
- Package manager is Bun (`bun.lock`)
