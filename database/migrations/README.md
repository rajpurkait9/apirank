# Database migrations

SQL migrations live here and are applied with:

```sh
bun run db:migrate
```

Optional Postgres: set `DATABASE_URL` (see `server/.env.example`). Local dev defaults to embedded PGlite.
