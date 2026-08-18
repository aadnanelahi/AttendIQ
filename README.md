# TechSight Workforce Management (AttendIQ)

Modern SaaS Workforce Management Platform by TechSight Innovations FZE LLC. Covers attendance, biometric devices, scheduling, leave, overtime, payroll, access control, visitor management, notifications, reporting, and AI-powered workforce intelligence.

## Vision
Build a modern, multi-tenant workforce platform with vendor-neutral device integration (ZKTeco and others via adapters), Arabic/English localization with RTL, real-time event processing, and full auditability.

## Repository Layout

```
apps/
  api/        Fastify REST API (TypeScript) — /api/v1
  web/        Next.js RTL dashboard (App Router + Tailwind)
  mobile/     Expo (React Native) employee app
packages/
  shared/     Domain constants, error codes, zod schemas, i18n catalogs
  db/         Prisma schema + seed + Prisma client
  core/       Attendance/leave/payroll engines (pure functions)
docs/         Product + architecture contract (authoritative)
```

## Prerequisites

- Node.js >= 20 (tested on 22/24)
- pnpm 11
- Docker (PostgreSQL 16 via `docker-compose.yml`)

## Quick Start

```bash
# 1. Start the database
docker compose up -d

# 2. Install workspace dependencies
pnpm install

# 3. Generate the Prisma client, apply schema, seed demo data
pnpm db:generate
pnpm db:push
pnpm db:seed

# 4. Configure local environment (secrets, DATABASE_URL)
cp .env.example .env
#     then edit; see apps/api/.env and packages/db/.env for local overrides

# 5. Run the API on :4000 and the web dashboard on :3000
pnpm dev            # API (tsx watch)
pnpm --filter @attendiq/web dev
```

### Seed credentials

| Role          | Email               | Password      |
| ------------- | ------------------- | ------------- |
| Platform admin | admin@attendiq.local | ChangeMe123! |
| Tenant admin  | admin@demo.local     | ChangeMe123! |

## Scripts

| Command           | Description                              |
| ----------------- | ---------------------------------------- |
| `pnpm dev`        | Run the API in watch mode on :4000       |
| `pnpm typecheck`  | Type-check all packages and apps         |
| `pnpm test`       | Run unit tests (core engines, etc.)      |
| `pnpm build`      | Build all packages and apps              |
| `pnpm db:push`    | Apply the Prisma schema to the database  |
| `pnpm db:seed`    | Seed platform + demo tenant              |

## API

Interactive docs (Swagger UI) at `http://localhost:4000/docs`. Errors use the envelope in `docs/api/API_ERROR_CODES.md` (`code`, `message`, `requestId`, optional `fieldErrors`).

Device-gateway ingestion:

```http
POST /api/v1/device-gateway/transactions
x-device-token: dkey_<id>.<secret>

{ "deviceId": "ZK-2002", "idempotencyKey": "batch-1",
  "transactions": [ { "userId": "9002", "timestamp": "2026-08-18T08:55:00Z", "type": "CHECK_IN" } ] }
```

Tokens are argon2-hashed at rest; the plain `dkey_<id>.<secret>` value is shown once at device creation and on `POST /devices/:id/rotate-token`.

## Language / Locale

English and Arabic are supported from day one (localization-ready catalogs in `packages/shared` and RTL layout in the web app). See `docs/localization/LOCALIZATION.md`.

## Deployment
- Cloud SaaS
- Customer-managed on-premise
- Hybrid device connectivity

## Core Principles
Security-first, API-first, multi-tenant, auditable, scalable, real-time, modular, and AI-ready.