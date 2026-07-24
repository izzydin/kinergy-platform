# 14. Zod-Validated Application Configuration

- **Status:** Accepted
- **Date:** 2026-07-24

## Context and Problem Statement

Application startup failures due to missing or misconfigured environment variables can cause cryptic runtime crashes. We require early fail-fast validation of environment variables supporting `development`, `test`, and `production` runtime environments.

## Decision Drivers

- Fail-fast environment validation using Zod schemas before NestJS initialization.
- Explicit support for `development`, `test`, and `production` environment modes (`NODE_ENV`).
- Type coercion and default values for optional variables (`PORT`, `API_PREFIX`, `CORS_ORIGINS`, `SWAGGER_ENABLED`).
- Modular configuration factories using NestJS `registerAs` (`appConfig`, `databaseConfig`).
- Exhaustive documentation in `.env.example`.

## Decision Outcome

Chosen Option: **Zod Schema Environment Validation integrated into NestJS `ConfigModule.forRoot`**.

### Configuration System Structure

1. **`env.validation.ts`**:
   - `envSchema`: Zod schema defining types, constraints, and coercion rules.
   - `validateEnv(config)`: Startup validation function throwing formatted Zod errors.
2. **`app.config.ts`**: NestJS `registerAs('app')` configuration namespace.
3. **`database.config.ts`**: NestJS `registerAs('database')` configuration namespace.
4. **`.env.example`**: Fully documented environment variable reference guide.

## Consequences

### Positive

- Prevents application deployment with invalid configurations.
- Fully typed configuration injection across services via `ConfigService`.
- Standardized environment variables documented in repository root.
