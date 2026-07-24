# 11. Prisma ORM Persistence Infrastructure Setup

- **Status:** Accepted
- **Date:** 2026-07-24

## Context and Problem Statement

The Kinergy Platform requires a type-safe, performant ORM layer for PostgreSQL database interaction, migration management, and database seeding.

## Decision Drivers

- End-to-end TypeScript safety and automatic Prisma Client code generation.
- Declarative schema definition in `prisma/schema.prisma`.
- Clean integration with NestJS dependency injection via `@Global()` `PrismaModule` and `PrismaService`.
- Standardized migration (`prisma migrate dev`) and seeding workflow (`prisma db seed`).

## Decision Outcome

Chosen Option: **Prisma ORM with PostgreSQL Datasource**.

### Component Specifications

1. **Schema & Configuration (`prisma/schema.prisma`)**:
   - `prisma-client-js` generator.
   - `postgresql` datasource connected via `DATABASE_URL`.
2. **NestJS Service & Module (`apps/api/src/platform/persistence/prisma/`)**:
   - `PrismaService`: `@Injectable()` service extending `PrismaClient`, managing connection state with NestJS `OnModuleInit` and `OnModuleDestroy` hooks.
   - `PrismaModule`: `@Global()` NestJS module exporting `PrismaService` for global access across persistence repositories.
3. **Database Seeding (`prisma/seed.ts`)**:
   - TypeScript seed runner configured in `package.json` (`"prisma": { "seed": "ts-node prisma/seed.ts" }`).
4. **Workspace Scripts**:
   - `pnpm prisma:generate`: Generates Prisma Client types.
   - `pnpm prisma:migrate`: Runs database migrations in development.
   - `pnpm prisma:seed`: Triggers database seed execution.

## Consequences

### Positive

- Fully typed database queries across backend persistence repositories.
- Automatic database migration tracking in `prisma/migrations/`.
- Decoupled persistence infrastructure encapsulated inside NestJS platform module.
