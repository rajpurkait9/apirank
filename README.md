# APIRank

Open-source API quality, performance monitoring, observability, and AI optimization platform.

> **Status:** scaffolding phase — monorepo foundation only. Application features are not implemented yet.

## Repository layout

```
apirank/
├── apps/       # Deployable applications (API, web, workers)
├── packages/   # Shared libraries and internal packages
├── database/   # Database schemas, migrations, tooling
├── docs/       # Project documentation
├── examples/   # Usage examples
└── .github/    # CI workflows and repository configuration
```

## Prerequisites

- [Bun](https://bun.sh) >= 1.3

## Getting started

```sh
bun install
bun run build
```

## Scripts

| Script                 | Description                                  |
| ---------------------- | -------------------------------------------- |
| `bun run dev`          | Run all apps/packages in development mode    |
| `bun run build`        | Build all workspaces (via Turborepo)         |
| `bun run typecheck`    | Typecheck all workspaces (via Turborepo)     |
| `bun run lint`         | Lint and check formatting (Biome)            |
| `bun run lint:fix`     | Fix lint/format issues                       |
| `bun run format`       | Format code (Biome formatter)                |
| `bun run format:check` | Check formatting without writing             |
| `bun run test`         | Run tests across all workspaces              |
| `bun run clean`        | Remove build artifacts (via Turborepo)       |

## Tooling

- **Package manager & runtime:** Bun (workspaces)
- **Build orchestration:** Turborepo
- **Language:** TypeScript (strict)
- **Linting & formatting:** Biome

## License

[MIT](./LICENSE)
