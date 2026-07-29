# 37. Secure HTTP Defaults, Production Helmet, and Multi-Tenant CORS Infrastructure

- **Status:** Accepted
- **Impact Level:** Critical (Web Application Security & Cross-Origin Resource Protection)
- **Date:** 2026-07-29

## Context and Problem Statement

The Kinergy API serves enterprise web applications, mobile frontends, and potential multi-tenant customer frontends. Previously, HTTP security configuration in `apps/api/src/main.ts` relied on basic unconfigured `helmet()` invocation and hardcoded wildcard CORS (`origin: '*'`) paired with `credentials: true`. This posed severe security risks:

1. Wildcard CORS with `credentials: true` violates standard browser CORS security policies and permits unauthorized cross-origin credentialed requests.
2. Hardcoded security options prevented environment-driven configuration across development, staging, and production environments.
3. Lack of dynamic origin resolution blocked support for future multi-tenant customer frontends (e.g. `https://tenant1.kinergy.com`).

To align with OWASP Secure Headers Recommendations and OWASP ASVS 4.0 standards, web security infrastructure must be centralized, environment-driven, non-wildcard in production, and hardened with HTTP security headers.

## Decision Drivers

1. **OWASP Secure Headers Compliance**: Strict enforcement of HSTS, CSP, X-Frame-Options (DENY), X-Content-Type-Options (nosniff), Referrer-Policy, and Permissions-Policy.
2. **Zero Wildcards in Production**: Zod environment schema (`env.validation.ts`) must enforce that `CORS_ORIGINS` in production mode rejects `*` and requires explicit allowed origin URLs or tenant domain regex patterns.
3. **Centralized NestJS Architecture**: CORS configuration must be encapsulated behind `ICorsConfiguration` (`CORS_CONFIGURATION`) and `ConfigCorsConfiguration` within `WebSecurityModule`.
4. **Multi-Tenant Frontend Readiness**: Dynamic origin evaluation (`isOriginAllowed`) must support both static origin whitelists and regular expression matching (`CORS_TENANT_DOMAIN_PATTERN`) for tenant subdomains.
5. **Credentialed Requests Support**: Enable credentialed requests (`Access-Control-Allow-Credentials: true`) safely paired with exact dynamic origin echo matching rather than wildcards.

## Decision Outcome

Chosen Option: **Centralized WebSecurityModule with ConfigCorsConfiguration, OWASP Helmet Security Options, and SecurityHeadersMiddleware**.

### Architecture Overview

```
                          ┌───────────────────────────┐
                          │    env.validation.ts      │
                          │   (Zod Validation Rules)  │
                          └─────────────┬─────────────┘
                                        │
                                        ▼
                         ┌─────────────────────────────┐
                         │   ConfigCorsConfiguration   │
                         │  (ICorsConfiguration Port)  │
                         └──────────────┬──────────────┘
                                        │
                                        ▼
                         ┌─────────────────────────────┐
                         │ dynamic origin evaluation   │
                         │  - Explicit Whitelist       │
                         │  - Multi-tenant Domain Regex│
                         └──────────────┬──────────────┘
                                        │
                                        ▼
  ┌───────────────────────┐  ┌────────────────────────┐  ┌─────────────────────────┐
  │ app.enableCors(opts)  │  │ helmetSecurityOptions  │  │SecurityHeadersMiddleware│
  │ (Dynamic Origin Echo) │  │ (CSP, HSTS, Frameguard)│  │ (Permissions-Policy)    │
  └───────────────────────┘  └────────────────────────┘  └─────────────────────────┘
```

### Key Security Implementations

1. **Environment Schema & Validation (`env.validation.ts`)**
   - Configurable variables: `CORS_ORIGINS`, `CORS_ALLOWED_METHODS`, `CORS_ALLOWED_HEADERS`, `CORS_EXPOSED_HEADERS`, `CORS_MAX_AGE`, `CORS_ALLOW_CREDENTIALS`, `CORS_TENANT_DOMAIN_PATTERN`.
   - Production validation: Rejects `*` in `CORS_ORIGINS` when `NODE_ENV === 'production'`.

2. **Dynamic CORS Evaluation (`ConfigCorsConfiguration`)**
   - Permits same-origin, server-to-server, mobile app, or Postman calls (where `Origin` header is omitted).
   - Validates incoming `Origin` against static whitelist and optional tenant domain regex (`CORS_TENANT_DOMAIN_PATTERN`).
   - Caches preflight OPTIONS requests for 24 hours (`maxAge: 86400`).

3. **Production Helmet Options (`helmetSecurityOptions`)**
   - `Content-Security-Policy`: Restricts default sources to `'self'`.
   - `Strict-Transport-Security` (HSTS): Enforces 1-year duration (`maxAge: 31536000`), `includeSubDomains`, and `preload`.
   - `X-Frame-Options`: Sets `DENY` to defeat clickjacking.
   - `X-Content-Type-Options`: Sets `nosniff` to defeat MIME-sniffing.
   - `Referrer-Policy`: Enforces `strict-origin-when-cross-origin`.

4. **Supplementary Security Headers Middleware (`SecurityHeadersMiddleware`)**
   - Injects `Permissions-Policy` (`camera=(), microphone=(), geolocation=(), payment=()`).
   - Injects `X-Permitted-Cross-Domain-Policies: none` and `X-Download-Options: noopen`.

## OWASP Secure Headers Self-Review Compliance Table

| Header                                | Configured Value                                                                          | Status     |
| :------------------------------------ | :---------------------------------------------------------------------------------------- | :--------- |
| **Strict-Transport-Security**         | `max-age=31536000; includeSubDomains; preload`                                            | **PASSED** |
| **X-Frame-Options**                   | `DENY`                                                                                    | **PASSED** |
| **X-Content-Type-Options**            | `nosniff`                                                                                 | **PASSED** |
| **Content-Security-Policy**           | `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'` | **PASSED** |
| **Referrer-Policy**                   | `strict-origin-when-cross-origin`                                                         | **PASSED** |
| **Permissions-Policy**                | `camera=(), microphone=(), geolocation=(), payment=(), usb=()`                            | **PASSED** |
| **X-Permitted-Cross-Domain-Policies** | `none`                                                                                    | **PASSED** |
| **X-Download-Options**                | `noopen`                                                                                  | **PASSED** |
| **Access-Control-Allow-Origin**       | Dynamic Echo Matching (Non-wildcard in Prod)                                              | **PASSED** |
| **Access-Control-Allow-Credentials**  | `true` (Paired with exact echo origin)                                                    | **PASSED** |

## Related ADRs

- [ADR 0007](file:///c:/Projects/kinergy-platform/docs/adr/0007-nestjs-application-scaffolding.md): NestJS Application Scaffolding in `apps/api`
- [ADR 0014](file:///c:/Projects/kinergy-platform/docs/adr/0014-zod-validated-application-configuration.md): Zod-Validated Application Configuration
- [ADR 0020](file:///c:/Projects/kinergy-platform/docs/adr/0020-production-security-configuration-hardening.md): Production Security Configuration Hardening
