# Security Architecture & Operations Index

- **Status:** Active
- **Compliance:** OWASP ASVS 4.0 & OWASP API Security Top 10

---

## Security Documentation Map

1. **[Authentication Specification](file:///c:/Projects/kinergy-platform/docs/security/authentication.md)**
   - Dual-token JWT architecture, Refresh Token Rotation (RTR), zero-information-disclosure errors, and side-channel timing attack defenses.

2. **[Authorization Framework](file:///c:/Projects/kinergy-platform/docs/security/authorization.md)**
   - Role-Based Access Control (RBAC), permission resolution, `@RequirePermissions()` decorators, and `AuthorizationEvaluator`.

3. **[Authenticated Request Context](file:///c:/Projects/kinergy-platform/docs/security/identity-context.md)**
   - `RequestContext` pipeline, `AsyncLocalStorage` propagation, and request-scoped identity context accessors.

4. **[Password Infrastructure & Policy](file:///c:/Projects/kinergy-platform/docs/security/password-policy.md)**
   - Hardened Argon2id parameters ($m=64\text{MB}, t=3, p=4$), password complexity validation, reuse prevention, and CSPRNG reset flows.

5. **[JWT Token Strategy](file:///c:/Projects/kinergy-platform/docs/security/token-strategy.md)**
   - Asymmetric signature algorithms, claim structures, and token configuration abstractions.

6. **[Web Security, CORS & Helmet](file:///c:/Projects/kinergy-platform/docs/security/web-security-cors-and-headers.md)**
   - Production Helmet options, OWASP security headers (HSTS, CSP, X-Frame-Options: DENY), and multi-tenant environment-driven CORS configuration.

7. **[Audit Logging Infrastructure](file:///c:/Projects/kinergy-platform/docs/security/audit-logging-architecture.md)**
   - Abstract `IAuditEventPublisher` port, `LoggerAuditEventPublisher` adapter, `SecurityAuditHookService`, and normalized `IAuditEvent` schema.
