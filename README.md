# APIRank

Open-source API performance monitoring — dashboard and API for slow-request ingest and project management.

## Layout

```
apirank/
├── web/                 # Dashboard (React + Vite + TanStack)
├── server/              # Bun + Hono API + Postgres/PGlite
├── database/migrations/
└── docker-compose.yml   # Optional local Postgres
```

### Prerequisites

- [Bun](https://bun.sh) >= 1.3
- Docker (optional, for real Postgres)

### Run the stack

```sh
bun install
bun run build
bun run dev
```

- API: http://localhost:3000 (embedded Postgres/PGlite by default — no Docker required)
- Dashboard: http://localhost:5173

Optional real Postgres:

```sh
docker compose up -d
# set DATABASE_URL=postgres://apirank:apirank@localhost:5432/apirank
bun run db:migrate
```

## Scripts

| Script | Description |
| --- | --- |
| `bun run dev` | Run web + server in development |
| `bun run build` | Build web + server |
| `bun run typecheck` | Typecheck both projects |
| `bun run lint` | Lint with Biome + ESLint |
| `bun run test` | Run server tests |
| `bun run db:migrate` | Apply SQL migrations |

## License

[MIT](./LICENSE)
