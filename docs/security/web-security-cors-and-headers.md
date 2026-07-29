# Web Security, CORS, and HTTP Security Headers Guide

## Executive Summary

The Kinergy Platform API implements enterprise-grade HTTP web security defaults complying with OWASP Secure Headers recommendations and OWASP ASVS 4.0 standards. All cross-origin resource access and security headers are centrally managed through NestJS `WebSecurityModule` and validated via Zod environment schemas.

---

## 1. Allowed Origins Strategy

Cross-Origin Resource Sharing (CORS) is configured using a centralized service (`ConfigCorsConfiguration`) to ensure strict boundary enforcement across development, staging, and production environments.

### Environment Origin Policies

| Environment              | Allowed Origins Strategy                                                                      | Wildcard (`*`) Permitted?  |
| :----------------------- | :-------------------------------------------------------------------------------------------- | :------------------------- |
| **Development**          | `http://localhost:4200`, `http://localhost:3000` (or `*` for local dev)                       | **YES** (Only in non-prod) |
| **Testing / CI**         | `http://localhost:4200`, `http://localhost:3000`                                              | **NO**                     |
| **Staging / Production** | Explicit comma-separated origins (e.g. `https://app.kinergy.com`) OR multi-tenant regex match | **STRICTLY PROHIBITED**    |

### Environment Configuration Variables

- `CORS_ORIGINS`: Comma-separated list of allowed origins (e.g. `https://app.kinergy.com,https://admin.kinergy.com`). In production, Zod validation rejects wildcard `*`.
- `CORS_TENANT_DOMAIN_PATTERN`: Optional regular expression string to dynamically match tenant subdomains (e.g. `^https://([a-z0-9-]+)\.kinergy\.com$`).
- `CORS_ALLOWED_METHODS`: Permitted HTTP verbs (`GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS`).
- `CORS_ALLOWED_HEADERS`: Permitted request headers (`Content-Type,Authorization,X-Requested-With,Accept,Origin,X-Tenant-ID`).
- `CORS_EXPOSED_HEADERS`: Headers accessible to client JavaScript (`Content-Range,X-Content-Range,X-Total-Count,X-Request-ID`).
- `CORS_MAX_AGE`: Preflight cache duration in seconds (`86400` = 24 hours).
- `CORS_ALLOW_CREDENTIALS`: Boolean flag enabling credentialed requests (`true`).

---

## 2. Credentials & Cookie Policy

Cross-origin requests carrying authentication tokens or cookies require `Access-Control-Allow-Credentials: true`.

> [!IMPORTANT]
> **Credentialed CORS Security Rule**: Browsers automatically reject CORS responses returning both `Access-Control-Allow-Credentials: true` and `Access-Control-Allow-Origin: *`.
>
> The Kinergy API resolves this by executing dynamic origin echo matching: when an incoming `Origin` header matches either an explicit origin in `CORS_ORIGINS` or the `CORS_TENANT_DOMAIN_PATTERN` regex, the API echoes back that exact origin in `Access-Control-Allow-Origin`, allowing credentials safely without exposing wildcard access.

---

## 3. Security Headers Configuration

HTTP security headers protect the application against Clickjacking, MIME-sniffing, Cross-Site Scripting (XSS), drive-by downloads, and feature abuse.

### Configured Headers Overview

```
Client Browser  ◄─── HTTPS Response Headers ─── Kinergy API (Helmet + SecurityHeadersMiddleware)
                     ├── Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
                     ├── X-Frame-Options: DENY
                     ├── X-Content-Type-Options: nosniff
                     ├── Content-Security-Policy: default-src 'self'...
                     ├── Referrer-Policy: strict-origin-when-cross-origin
                     ├── Permissions-Policy: camera=(), microphone=()...
                     ├── X-Permitted-Cross-Domain-Policies: none
                     └── X-Download-Options: noopen
```

| Header                              | Value                                          | Purpose                                                       |
| :---------------------------------- | :--------------------------------------------- | :------------------------------------------------------------ |
| `Strict-Transport-Security`         | `max-age=31536000; includeSubDomains; preload` | Forces HTTPS for 1 year, including all subdomains.            |
| `X-Frame-Options`                   | `DENY`                                         | Prevents framing to defeat Clickjacking attacks.              |
| `X-Content-Type-Options`            | `nosniff`                                      | Blocks MIME-type sniffing by browsers.                        |
| `Content-Security-Policy`           | `default-src 'self' ...`                       | Restricts resources loaded to verified origins.               |
| `Referrer-Policy`                   | `strict-origin-when-cross-origin`              | Limits referrer leakage on cross-origin requests.             |
| `Permissions-Policy`                | `camera=(), microphone=(), geolocation=()...`  | Disables high-risk browser hardware APIs.                     |
| `X-Permitted-Cross-Domain-Policies` | `none`                                         | Prevents Flash / Adobe cross-domain policy files.             |
| `X-Download-Options`                | `noopen`                                       | Prevents automatic execution of HTML downloads in IE context. |

---

## 4. Future Deployment & Multi-Tenant Frontend Recommendations

As the platform scales to support multi-tenant customer frontends (e.g. `https://tenant-alpha.kinergy.com`, `https://tenant-beta.kinergy.com`), follow these deployment guidelines:

1. **Subdomain Wildcard DNS & TLS Certificates**:
   - Provision wildcard TLS certificates (`*.kinergy.com`) via Let's Encrypt / AWS Certificate Manager to secure tenant endpoints automatically.
2. **Reverse Proxy & Edge Router Configuration (Cloudflare / NGINX)**:
   - Ensure edge proxies pass the original client `Host` and `Origin` headers unaltered to `apps/api`.
   - Strip client-supplied `X-Forwarded-Host` unless verified from trusted internal proxies.
3. **Environment Variable Tenant Pattern**:
   - Configure `CORS_TENANT_DOMAIN_PATTERN="^https://([a-z0-9-]+)\\.kinergy\\.com$"` in staging and production environment files (`.env.production`).
4. **Custom Tenant Domains (CNAME Branding)**:
   - For enterprise customers using custom domains (e.g. `https://sustainability.customer.com`), append explicit domains to `CORS_ORIGINS` via environment variable updates or dynamic database origin lookup.

---

## 5. OWASP Secure Headers Compliance Self-Review

| OWASP Criterion                           | Status     | Verification & Evidence                                                          |
| :---------------------------------------- | :--------- | :------------------------------------------------------------------------------- |
| **HTTP Strict Transport Security (HSTS)** | **PASSED** | `max-age=31536000; includeSubDomains; preload` configured via Helmet.            |
| **Clickjacking Protection**               | **PASSED** | `X-Frame-Options: DENY` and CSP `frame-src 'none'`.                              |
| **MIME Sniffing Prevention**              | **PASSED** | `X-Content-Type-Options: nosniff`.                                               |
| **Content Security Policy (CSP)**         | **PASSED** | Restricted directives (`default-src 'self'`, `object-src 'none'`).               |
| **Referrer Information Control**          | **PASSED** | `Referrer-Policy: strict-origin-when-cross-origin`.                              |
| **Browser Feature Restriction**           | **PASSED** | `Permissions-Policy` disabling camera, mic, geolocation, payment, USB.           |
| **Production CORS Non-Wildcard**          | **PASSED** | Zod `envSchema` rejects `*` in production mode.                                  |
| **Credentialed CORS Security**            | **PASSED** | Exact origin echo matching paired with `Access-Control-Allow-Credentials: true`. |
| **Centralized Architecture**              | **PASSED** | Encapsulated in NestJS `WebSecurityModule` (`ICorsConfiguration`).               |
