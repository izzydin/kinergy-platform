# 7. NestJS Application Scaffolding in `apps/api`

- **Status:** Accepted
- **Date:** 2026-07-24

## Context and Problem Statement

The Kinergy Platform requires a modular, high-performance backend application baseline capable of handling REST requests, validating environment configurations, providing OpenAPI documentation, and enforcing enterprise security standards.

## Decision Drivers

- Enforcing strict security headers and payload compression out of the box.
- Interactive API documentation generation via OpenAPI Swagger.
- Strict input validation schema and environment variable checking at application startup.
- Clean shutdown signal handling for containerized deployments.

## Decision Outcome

Chosen Option: **NestJS Application in `apps/api` configured with Express, Helmet, Compression, CORS, Swagger, and ConfigModule**.

### Architecture Specifications

1. **Bootstrap (`main.ts`)**:
   - Security headers enabled via `helmet()`.
   - Payload compression enabled via `compression()`.
   - Cross-Origin Resource Sharing (`app.enableCors()`).
   - Global URL Prefix set to `/api/v1`.
   - Global `ValidationPipe` (`whitelist: true`, `transform: true`, `forbidNonWhitelisted: true`).
   - Swagger OpenAPI interactive UI hosted at `/api/docs`.
   - Graceful shutdown listeners via `app.enableShutdownHooks()`.
2. **Environment Validation (`src/config/env.validation.ts`)**:
   - `class-validator` schema validating `NODE_ENV`, `PORT`, `API_PREFIX`, and `DATABASE_URL` during startup.
3. **No Domain Business Logic**:
   - Domain logic remains in framework-agnostic libraries (`libs/`). Controllers only orchestrate HTTP requests.

## Consequences

### Positive

- Production-ready security, performance, and API documentation standard.
- Environment validation fails early at startup if variables are missing.
- Framework-agnostic domain layer maintained.
