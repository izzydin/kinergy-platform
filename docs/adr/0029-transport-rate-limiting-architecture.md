# 29. Transport Rate Limiting Architecture

- **Status:** Accepted
- **Date:** 2026-07-27

## Context and Problem Statement

Authentication endpoints (`/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me`) perform CPU-intensive password verification (Argon2id) and session state mutations. Without transport-level throttling, endpoints are vulnerable to credential brute-force attacks and CPU exhaustion DDoS. Rate-limiting is a pure infrastructure concern and must not pollute domain logic or application use cases.

## Decision Drivers

- **Defense in Depth**: Application-level rate limiting serves as the application's last line of defense behind Cloudflare edge WAFs, API Gateways, and NGINX load balancers.
- **Externalized Policy Configuration**: Policy thresholds (`AUTH_LOGIN_LIMIT`, `AUTH_LOGIN_WINDOW`, `AUTH_REFRESH_LIMIT`, `AUTH_REFRESH_WINDOW`, `AUTH_LOGOUT_LIMIT`, `AUTH_LOGOUT_WINDOW`, `AUTH_ME_LIMIT`, `AUTH_ME_WINDOW`) are validated via Zod schema and consumed via `IRateLimitConfiguration` (`RATE_LIMIT_CONFIGURATION`).
- **Clean Architecture & Separation**: Rate-limiting metadata decorators (`@LoginThrottle()`, `@RefreshThrottle()`, `@LogoutThrottle()`, `@MeThrottle()`, `@SkipThrottle()`) are attached to HTTP controllers. Zero rate-limiting logic exists in domain or application use cases.
- **Standardized Error Handling**: Breaches return standardized HTTP `429 Too Many Requests` responses (`ThrottlerException`).

## Decision Outcome

Chosen Option: **Dedicated `RateLimitingModule` wrapping `@nestjs/throttler` with `CustomThrottlerGuard` and configuration abstraction**.

### Production Edge Protection Topology

```
Cloudflare WAF / Edge Rate Limiter
               │
               ▼
   API Gateway Rate Limiter
               │
               ▼
   NGINX / Reverse Proxy
               │
               ▼
    NestJS CustomThrottlerGuard (Application Last Line of Defense)
               │
               ▼
      Authentication Controllers
```

### Policy Defaults Matrix

| Endpoint Route       | Default Limit | Default Window | Decorator            |
| :------------------- | :------------ | :------------- | :------------------- |
| `POST /auth/login`   | 5 requests    | 60 seconds     | `@LoginThrottle()`   |
| `POST /auth/refresh` | 20 requests   | 60 seconds     | `@RefreshThrottle()` |
| `POST /auth/logout`  | 30 requests   | 60 seconds     | `@LogoutThrottle()`  |
| `GET /auth/me`       | 60 requests   | 60 seconds     | `@MeThrottle()`      |
| `GET /health`        | Unthrottled   | N/A            | `@SkipThrottle()`    |

## Consequences

### Positive

- OWASP Authentication Cheat Sheet compliance: brute-force mitigation on credential endpoints.
- Pluggable storage architecture: ready for future Redis-backed distributed throttling (`ThrottlerStorageRedisService`) or API Gateway offloading without code changes.
- 100% test coverage validating configuration and guard exception handling.
