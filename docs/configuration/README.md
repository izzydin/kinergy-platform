# Centralized Environment Configuration Guide

- **Status:** Active
- **Validation Engine:** Zod (`envSchema`) & NestJS `ConfigModule`
- **Scope:** Application Environment, Ports, Database, Security Secrets, CORS, Rate Limits, and Passwords

---

## 1. Environment Configuration Overview

The Kinergy Platform enforces strict, type-safe environment variable validation using Zod during application bootstrap (`validateEnv`). Missing or invalid environment variables cause immediate application fail-fast execution before port binding.

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
        └──────────────────┘    └────────────────────┘
```

---

## 2. Environment Variables Reference Matrix

### 2.1 Server & Application Configuration

| Variable     | Required | Default (Dev) | Type / Constraints                      | Description                  |
| :----------- | :------- | :------------ | :-------------------------------------- | :--------------------------- |
| `NODE_ENV`   | Optional | `development` | `development` \| `test` \| `production` | Node execution environment   |
| `PORT`       | Optional | `3000`        | Number ($1024 - 65535$)                 | Application HTTP port        |
| `API_PREFIX` | Optional | `api/v1`      | String                                  | Global REST API route prefix |

### 2.2 Database & Persistence

| Variable       | Required | Default (Dev) | Type / Constraints                        | Description                          |
| :------------- | :------- | :------------ | :---------------------------------------- | :----------------------------------- |
| `DATABASE_URL` | **Yes**  | N/A           | Valid PostgreSQL URL (`postgresql://...`) | Primary PostgreSQL connection string |

### 2.3 Cryptographic & Security Secrets

| Variable                 | Required | Default (Dev)                                       | Type / Constraints                                         | Description                           |
| :----------------------- | :------- | :-------------------------------------------------- | :--------------------------------------------------------- | :------------------------------------ |
| `JWT_ACCESS_SECRET`      | **Yes**  | `kinergy-platform-dev-access-secret-min-32-chars!`  | String $\ge 32$ chars. Dev default rejected in production. | Secret key for signing Access Tokens  |
| `JWT_REFRESH_SECRET`     | **Yes**  | `kinergy-platform-dev-refresh-secret-min-32-chars!` | String $\ge 32$ chars. Dev default rejected in production. | Secret key for signing Refresh Tokens |
| `JWT_ACCESS_EXPIRATION`  | Optional | `15m`                                               | Time format (`15m`, `1h`)                                  | Access Token duration                 |
| `JWT_REFRESH_EXPIRATION` | Optional | `7d`                                                | Time format (`7d`, `30d`)                                  | Refresh Token duration                |

### 2.4 CORS Configuration

| Variable                 | Required | Default (Dev)                                 | Type / Constraints                                         | Description                           |
| :----------------------- | :------- | :-------------------------------------------- | :--------------------------------------------------------- | :------------------------------------ |
| `CORS_ORIGINS`           | Optional | `http://localhost:3000,http://localhost:5173` | Comma-separated URLs. **Wildcard `*` prohibited in prod.** | Allowed cross-origin sources          |
| `CORS_ALLOW_CREDENTIALS` | Optional | `true`                                        | Boolean                                                    | Allow cookies / authorization headers |
| `CORS_MAX_AGE`           | Optional | `86400`                                       | Number (seconds)                                           | Preflight cache duration              |

### 2.5 Transport Rate Limiting Configuration

| Variable              | Required | Default (Dev) | Type / Constraints      | Description                       |
| :-------------------- | :------- | :------------ | :---------------------- | :-------------------------------- |
| `AUTH_LOGIN_LIMIT`    | Optional | `5`           | Integer $> 0$           | Max requests per login window     |
| `AUTH_LOGIN_WINDOW`   | Optional | `60`          | Integer $> 0$ (seconds) | Login rate limit sliding window   |
| `AUTH_REFRESH_LIMIT`  | Optional | `20`          | Integer $> 0$           | Max requests per refresh window   |
| `AUTH_REFRESH_WINDOW` | Optional | `60`          | Integer $> 0$ (seconds) | Refresh rate limit sliding window |

---

## 3. Production Hardening Rules

1. **No Hardcoded Fallbacks**: All secret environment variables must be explicitly set in production deployments via secret managers (AWS Secrets Manager, HashiCorp Vault).
2. **Startup Fail-Fast**: If `JWT_ACCESS_SECRET` or `JWT_REFRESH_SECRET` uses a default developer string in `NODE_ENV=production`, `ConfigSecretProvider.onModuleInit()` throws `SecurityConfigurationException` and terminates startup immediately.
