# Kinergy Platform - Environment Variables & Configuration Guide

- **Status:** Active & Authoritative Configuration Reference
- **Validation Engine:** Zod (`envSchema` in `apps/api/src/config/env.validation.ts`) & NestJS `ConfigModule`
- **Scope:** Application Environment, Database, Cryptographic Secrets, Web Security, CORS, Rate Limits, and Argon2id Hashing

---

## 1. Environment Architecture & Startup Validation

The Kinergy Platform enforces strict, type-safe environment variable validation during application bootstrap. Using **Zod (`envSchema`)** and `validateEnv()`, the platform inspects `process.env` before binding to HTTP ports.

```
                    ┌─────────────────────────┐
                    │  process.env Input      │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │ Zod envSchema Validation│
                    └────────────┬────────────┘
                         │                 │
               (Valid)   ▼                 ▼ (Invalid)
        ┌──────────────────┐    ┌────────────────────┐
        │ Parsed Typed Config│    │ Fail-Fast Startup  │
        └──────────────────┘    │ (Exit Code 1)      │
                                └────────────────────┘
```

### Fail-Fast Startup Strategy

1. **Validation Phase**: Executed synchronously during `NestFactory.create(AppModule)`.
2. **Schema Invariants**:
   - Rejects missing required variables (e.g. `DATABASE_URL`).
   - Coerces strings to integers and booleans with bounds checking.
   - Enforces minimum cryptographic secret lengths ($\ge 32$ characters).
   - In `NODE_ENV=production`, rejects developer default fallback strings for secrets and blocks wildcard CORS origins (`*`).
3. **Behavior on Failure**: If validation fails, `validateEnv` logs formatted JSON validation issues and throws an uncaught exception, terminating application startup immediately before binding to HTTP ports.

---

## 2. Secure Secret Management Guidelines

1. **Zero Secret Check-Ins**: Plaintext secrets (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `DATABASE_URL`) must NEVER be committed to Git repositories. `.gitignore` strictly excludes `.env` and `.env.local`.
2. **Production Secret Injection**: Secrets must be injected dynamically via environment variables from secure secret stores:
   - **Cloud Environments**: AWS Secrets Manager, HashiCorp Vault, Azure Key Vault, or Kubernetes Secrets.
   - **CI/CD Pipelines**: GitHub Actions Encrypted Secrets.
3. **Secret Rotation**: Access and refresh secrets should be rotated periodically. Rotating secrets increments token verification errors, requiring active users to re-authenticate cleanly via Refresh Token Rotation (RTR).

---

## 3. Comprehensive Environment Variable Specification

### 3.1 Server Execution Environment

#### `NODE_ENV`

- **Purpose**: Defines application execution mode (`development`, `test`, `production`).
- **Required**: No (Optional).
- **Default**: `development`
- **Security Considerations**: Controls production strictness rules in `envSchema` (rejects default secrets & wildcard CORS).
- **Example**: `NODE_ENV=production`
- **Development Usage**: `NODE_ENV=development`
- **Production Usage**: `NODE_ENV=production`

#### `PORT`

- **Purpose**: HTTP web server listening port.
- **Required**: No (Optional).
- **Default**: `3000`
- **Security Considerations**: Ensure port is not exposed directly to internet; place behind reverse proxy (Nginx, Cloudflare).
- **Example**: `PORT=3000`
- **Development Usage**: `PORT=3000`
- **Production Usage**: Set by container orchestrator (e.g. `PORT=8080`).

#### `API_PREFIX`

- **Purpose**: Global URI path prefix for all REST API endpoints.
- **Required**: No (Optional).
- **Default**: `api/v1`
- **Security Considerations**: Standardizes API versioning and routing filters.
- **Example**: `API_PREFIX=api/v1`
- **Development Usage**: `API_PREFIX=api/v1`
- **Production Usage**: `API_PREFIX=api/v1`

#### `SWAGGER_ENABLED`

- **Purpose**: Toggles OpenAPI / Swagger UI interactive documentation at `/api/docs`.
- **Required**: No (Optional).
- **Default**: `true`
- **Security Considerations**: Disable in production or restrict access via API gateway to prevent endpoint discovery by unauthorized users.
- **Example**: `SWAGGER_ENABLED=false`
- **Development Usage**: `SWAGGER_ENABLED=true`
- **Production Usage**: `SWAGGER_ENABLED=false`

---

### 3.2 Database & Persistence Infrastructure

#### `DATABASE_URL`

- **Purpose**: PostgreSQL database connection URI string for Prisma ORM.
- **Required**: **Yes** (Required).
- **Default**: `postgresql://postgres:postgres@localhost:5432/kinergy_db?schema=public`
- **Security Considerations**: Contains sensitive database credentials. Must use SSL (`sslmode=require`) in production and restricted database user privileges.
- **Example**: `DATABASE_URL=postgresql://app_user:StrongPass@db.internal:5432/kinergy_prod?schema=public&sslmode=require`
- **Development Usage**: Local Docker container URL.
- **Production Usage**: Managed RDS / Aurora PostgreSQL connection string via Secret Manager.

---

### 3.3 Cryptographic Security Secrets

#### `JWT_ACCESS_SECRET`

- **Purpose**: Secret key used to sign and verify short-lived Access Tokens.
- **Required**: **Yes** in production (Min 32 characters).
- **Default**: `kinergy-platform-dev-access-secret-min-32-chars!` (Development only)
- **Security Considerations**: **CRITICAL**. Must be a cryptographically secure random string ($\ge 256$ bits / 32 chars). Dev default string is REJECTED in `production`.
- **Example**: `JWT_ACCESS_SECRET=c8f92a10b4e571390d2e8b417f6a9c3d2e1f4a5b6c7d8e9f0a1b2c3d4e5f6a7b`
- **Development Usage**: Default dev string.
- **Production Usage**: Injected CSPRNG secret string.

#### `JWT_REFRESH_SECRET`

- **Purpose**: Secret key used to sign and verify Refresh Tokens.
- **Required**: **Yes** in production (Min 32 characters).
- **Default**: `kinergy-platform-dev-refresh-secret-min-32-chars!` (Development only)
- **Security Considerations**: **CRITICAL**. Must be distinct from `JWT_ACCESS_SECRET`. Dev default string is REJECTED in `production`.
- **Example**: `JWT_REFRESH_SECRET=7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a`
- **Development Usage**: Default dev string.
- **Production Usage**: Injected CSPRNG secret string.

#### `JWT_ACCESS_EXPIRES_IN`

- **Purpose**: Access token expiration window.
- **Required**: No (Optional).
- **Default**: `15m`
- **Security Considerations**: Keep window short ($15\text{ minutes}$) to minimize stolen token lifetime.
- **Example**: `JWT_ACCESS_EXPIRES_IN=15m`
- **Development Usage**: `15m`
- **Production Usage**: `15m`

#### `JWT_REFRESH_EXPIRES_IN`

- **Purpose**: Refresh token sliding-window expiration duration.
- **Required**: No (Optional).
- **Default**: `7d`
- **Security Considerations**: Bound to Refresh Token Rotation (RTR) family tracking.
- **Example**: `JWT_REFRESH_EXPIRES_IN=7d`
- **Development Usage**: `7d`
- **Production Usage**: `7d`

#### `JWT_ISSUER`

- **Purpose**: Issuer claim (`iss`) embedded in signed JWT tokens.
- **Required**: No (Optional).
- **Default**: `kinergy-platform`
- **Security Considerations**: Verified during token validation to prevent cross-service token misuse.
- **Example**: `JWT_ISSUER=kinergy-platform`
- **Development Usage**: `kinergy-platform`
- **Production Usage**: `kinergy-platform`

#### `JWT_AUDIENCE`

- **Purpose**: Audience claim (`aud`) embedded in signed JWT tokens.
- **Required**: No (Optional).
- **Default**: `kinergy-api`
- **Security Considerations**: Verified during token validation.
- **Example**: `JWT_AUDIENCE=kinergy-api`
- **Development Usage**: `kinergy-api`
- **Production Usage**: `kinergy-api`

---

### 3.4 Web Security & CORS Configuration

#### `CORS_ORIGINS`

- **Purpose**: Comma-separated list of origin URLs permitted to make cross-origin requests.
- **Required**: No (Optional).
- **Default**: `http://localhost:4200`
- **Security Considerations**: **Wildcard `*` is strictly REJECTED in production** by `envSchema`. Specify explicit frontend domain names.
- **Example**: `CORS_ORIGINS=https://app.kinergy.com,https://admin.kinergy.com`
- **Development Usage**: `http://localhost:4200,http://localhost:5173`
- **Production Usage**: Production web application domains.

#### `CORS_ALLOWED_METHODS`

- **Purpose**: Allowed HTTP methods for CORS preflight.
- **Required**: No (Optional).
- **Default**: `GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS`
- **Security Considerations**: Restrict to methods consumed by public API client routes.
- **Example**: `CORS_ALLOWED_METHODS=GET,POST,PUT,DELETE,OPTIONS`
- **Development Usage**: Default list.
- **Production Usage**: Default list.

#### `CORS_ALLOWED_HEADERS`

- **Purpose**: Allowed HTTP headers in CORS requests.
- **Required**: No (Optional).
- **Default**: `Content-Type,Authorization,X-Requested-With,Accept,Origin,X-Tenant-ID`
- **Security Considerations**: Includes `X-Tenant-ID` for multi-tenant SaaS context routing.
- **Example**: Same as default.

#### `CORS_EXPOSED_HEADERS`

- **Purpose**: HTTP headers exposed to browser client JavaScript.
- **Required**: No (Optional).
- **Default**: `Content-Range,X-Content-Range,X-Total-Count,X-Request-ID`
- **Security Considerations**: Exposes pagination metrics without leaking internal infrastructure headers.

#### `CORS_MAX_AGE`

- **Purpose**: Preflight `Access-Control-Max-Age` cache duration in seconds.
- **Required**: No (Optional).
- **Default**: `86400` ($24\text{ hours}$)
- **Security Considerations**: Reduces preflight OPTIONS request volume.

#### `CORS_ALLOW_CREDENTIALS`

- **Purpose**: Toggles `Access-Control-Allow-Credentials` header to allow cookies.
- **Required**: No (Optional).
- **Default**: `true`
- **Security Considerations**: Required for HTTP-Only `refreshToken` cookie transmission. Must never be paired with wildcard origins.

#### `CORS_TENANT_DOMAIN_PATTERN`

- **Purpose**: Optional regex pattern matching multi-tenant subdomains.
- **Required**: No (Optional).
- **Default**: `undefined`
- **Security Considerations**: Allows dynamic subdomain authorization (e.g. `.*\.kinergy\.com$`).

---

### 3.5 Transport Rate Limiting Settings

#### `AUTH_LOGIN_LIMIT` & `AUTH_LOGIN_WINDOW`

- **Purpose**: Max request count and sliding window (seconds) for `/auth/login`.
- **Defaults**: `5` requests per `60` seconds.
- **Security Considerations**: Mitigates brute-force credential guessing attacks.

#### `AUTH_REFRESH_LIMIT` & `AUTH_REFRESH_WINDOW`

- **Purpose**: Max request count and sliding window for `/auth/refresh`.
- **Defaults**: `20` requests per `60` seconds.
- **Security Considerations**: Prevents RTR flood attacks.

#### `AUTH_LOGOUT_LIMIT` & `AUTH_LOGOUT_WINDOW`

- **Purpose**: Max request count and sliding window for `/auth/logout`.
- **Defaults**: `30` requests per `60` seconds.

#### `AUTH_ME_LIMIT` & `AUTH_ME_WINDOW`

- **Purpose**: Max request count and sliding window for `/auth/me`.
- **Defaults**: `60` requests per `60` seconds.

---

### 3.6 Argon2id Password Hashing Parameters

#### `ARGON2_MEMORY_COST`

- **Purpose**: Memory cost ($m$) for Argon2id hashing in KB.
- **Required**: No (Optional).
- **Default**: `65536` ($64\text{ MB}$). Minimum allowed: `15360` ($15\text{ MB}$).
- **Security Considerations**: High memory cost prevents GPU/ASIC offline password cracking.

#### `ARGON2_TIME_COST`

- **Purpose**: Time iterations ($t$) for Argon2id hashing.
- **Required**: No (Optional).
- **Default**: `3`. Minimum allowed: `1`.

#### `ARGON2_PARALLELISM`

- **Purpose**: Parallel threads ($p$) for Argon2id calculation.
- **Required**: No (Optional).
- **Default**: `4`. Minimum allowed: `1`.

#### `ARGON2_HASH_LENGTH`

- **Purpose**: Output hash digest length in bytes.
- **Required**: No (Optional).
- **Default**: `32`. Minimum allowed: `16`.

---

### 3.7 Password Complexity & Lifecycle Policy

#### `PASSWORD_MIN_LENGTH` & `PASSWORD_MAX_LENGTH`

- **Purpose**: Candidate password length boundaries.
- **Defaults**: Minimum `12`, Maximum `128`.
- **Security Considerations**: Aligns with NIST SP 800-63B standards; max length prevents DoS CPU exhaustion.

#### `PASSWORD_REQUIRE_UPPERCASE`, `LOWERCASE`, `NUMBER`, `SPECIAL_CHAR`

- **Purpose**: Toggles mandatory character composition requirements.
- **Defaults**: `true` across all composition categories.

#### `PASSWORD_HISTORY_LIMIT`

- **Purpose**: Number of previous password hashes retained to prevent password reuse.
- **Default**: `5`. Range: `0` to `24`.
