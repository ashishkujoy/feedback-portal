# Intern Feedback Portal

A web portal where mentors and program managers of an internship program record intern feedback, color codes, one-on-one conversations and decisions, so everyone works from the same record.

## Prerequisites

- Node.js 24 (see `.nvmrc`)
- pnpm 12
- Docker (for Compose and Testcontainers)

## Getting started

```sh
pnpm install
cp apps/api/.env.example apps/api/.env
docker compose up -d --wait postgres     # Postgres 18.6 on localhost:5433
pnpm db:migrate
pnpm --filter @feedback-portal/api dev   # http://localhost:3000/health
```

On macOS with Colima, run `colima start` first.

## Running tests

| Command | What runs | Needs Docker |
|---|---|---|
| `pnpm check` | format, lint, typecheck, all tests | yes |
| `pnpm test` | unit + integration tests in every package | yes |
| `pnpm --filter @feedback-portal/api test:unit` | API unit tests only | no |
| `pnpm --filter @feedback-portal/api test:int` | API integration tests only | yes |

- **What the integration tests (`*.int.test.ts`) use:** a throwaway `postgres:18.6-alpine` container started by Testcontainers. It is separate from the Compose database.
- **Isolation:** each test file gets its own database, cloned from a migrated template, and tables are emptied before each test.
- **Docker connection:** Testcontainers uses `DOCKER_HOST`. With Colima that is `unix://$HOME/.colima/default/docker.sock`.

## Docs

- [Product description](PRODUCT.md)
- [Tech stack](TECH_STACK.md)
- [Data model](DATA_MODEL.md)
- [Roadmap](ROADMAP.md)
- [Workflow & task status](workflow/README.md)
