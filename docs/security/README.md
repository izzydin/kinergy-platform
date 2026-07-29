# Kinergy Platform - Security Architecture & Policy Index

- **Status:** Active & Production-Hardened
- **Compliance Baseline:** OWASP ASVS 4.0 (Level 2), OWASP API Security Top 10, NIST SP 800-63B
- **Security Lead:** Principal Security Architect & DevSecOps Lead

---

## 📚 Security Documentation Map

Welcome to the centralized Security Architecture hub for the **Kinergy Platform**. This page links every security specification, policy, threat model, and Architectural Decision Record (ADR).

```
docs/security/
├── README.md                          ◄── Security Master Index & Quality Baseline
├── authentication.md                  ◄── Dual-Token JWT, RTR, Generic Errors & Timing Attack Defenses
├── authorization.md                   ◄── RBAC/ABAC Engine, Decision Evaluator & Decorators
├── role-permission-matrix.md          ◄── Authoritative 22-Permission & System Role Matrix
├── identity-context.md                ◄── (Merged into docs/architecture/identity-domain-model.md)
├── password-policy.md                 ◄── Argon2id Parameters, NIST SP 800-63B & Reset Workflows
├── token-strategy.md                  ◄── Token Lifecycles, Version Invalidation & Rotation Rules
├── web-security-cors-and-headers.md   ◄── Production Helmet Headers, HSTS, CSP & Multi-Tenant CORS
└── audit-logging-architecture.md      ◄── Standardized IAuditEvent Schemas & Security Audit Hooks
```

---

## 🚀 Quick Navigation

### 1. Authentication & Operational Hardening

- **[Authentication Specification](file:///c:/Projects/kinergy-platform/docs/security/authentication.md)**: Zero-information-disclosure generic errors (`Invalid email or password.`), constant-time dummy Argon2id hash execution (`DUMMY_ARGON2_HASH`), fail-fast startup secret validation, and sliding-window Refresh Token Rotation (RTR).
- **[Password Policy & Infrastructure](file:///c:/Projects/kinergy-platform/docs/security/password-policy.md)**: Memory-hard Argon2id parameters ($m=64\text{MB}, t=3, p=4$), NIST SP 800-63B complexity standards, CSPRNG temporary password resets, and reuse prevention.
- **[Token Strategy](file:///c:/Projects/kinergy-platform/docs/security/token-strategy.md)**: Dual-token symmetric/asymmetric JWT signing, token versioning (`tokenVersion`), and family reuse detection.

### 2. Authorization & Entitlement Engine

- **[Authorization Framework](file:///c:/Projects/kinergy-platform/docs/security/authorization.md)**: Default-Deny architecture, thin `AuthorizationGuard`, application-layer decision engine (`DefaultAuthorizationEvaluator`), and wildcard permission resolution (`IPermissionResolver`).
- **[Role & Permission Matrix](file:///c:/Projects/kinergy-platform/docs/security/role-permission-matrix.md)**: Authoritative matrix mapping system roles (`Owner`, `Trainer`, `Kitchen Staff`, `Receptionist`) to 22 seeded permission definitions across 9 functional modules.

### 3. Identity Domain Architecture

- **[Identity Domain Model](file:///c:/Projects/kinergy-platform/docs/architecture/identity-domain-model.md)**: Consolidated specification for `User` aggregate root, account state machine (`UserStatusStateMachine`), and Clean Architecture layer isolation.

### 4. Transport & Web Security

- **[Web Security, CORS & Helmet](file:///c:/Projects/kinergy-platform/docs/security/web-security-cors-and-headers.md)**: Production Helmet options (`Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`), environment-driven CORS origins, and transport rate limiting (`@nestjs/throttler`).

### 5. Audit Logging Infrastructure

- **[Audit Logging Architecture](file:///c:/Projects/kinergy-platform/docs/security/audit-logging-architecture.md)**: Decoupled `IAuditEventPublisher` port, `LoggerAuditEventPublisher` adapter, `SecurityAuditHookService`, and normalized `IAuditEvent` schema.

---

## 🏛️ Security Architectural Decision Records (ADRs)

| ADR ID                                                                                                                     | Title                                    |    Status    | Core Decision / Alignment                                          |
| :------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------- | :----------: | :----------------------------------------------------------------- |
| **[ADR 0017](file:///c:/Projects/kinergy-platform/docs/adr/0017-password-infrastructure-argon2id.md)**                     | Password Infrastructure via Argon2id     | `Superseded` | Superseded by ADR 0036                                             |
| **[ADR 0018](file:///c:/Projects/kinergy-platform/docs/adr/0018-jwt-token-infrastructure.md)**                             | JWT Token Infrastructure                 |  `Accepted`  | Asymmetric/Symmetric JWT signing & claim structure                 |
| **[ADR 0019](file:///c:/Projects/kinergy-platform/docs/adr/0019-refresh-token-persistence-strategy.md)**                   | Refresh Token Persistence Strategy       |  `Accepted`  | Refresh token family persistence in PostgreSQL                     |
| **[ADR 0020](file:///c:/Projects/kinergy-platform/docs/adr/0020-production-security-configuration-hardening.md)**          | Production Security Hardening            | `Superseded` | Superseded by ADR 0037                                             |
| **[ADR 0022](file:///c:/Projects/kinergy-platform/docs/adr/0022-token-configuration-policy-abstraction.md)**               | Token Configuration Policy Abstraction   |  `Accepted`  | `ConfigTokenConfiguration` Zod env binding                         |
| **[ADR 0023](file:///c:/Projects/kinergy-platform/docs/adr/0023-extensible-security-event-infrastructure.md)**             | Extensible Security Event Infrastructure |  `Accepted`  | Decoupled `ISecurityEventPublisher` port                           |
| **[ADR 0024](file:///c:/Projects/kinergy-platform/docs/adr/0024-authentication-guard-architecture.md)**                    | Authentication Guard Architecture        |  `Accepted`  | Stateless `AuthenticationGuard` & `@Public()` bypass               |
| **[ADR 0025](file:///c:/Projects/kinergy-platform/docs/adr/0025-role-and-permission-authorization-framework.md)**          | RBAC & Permission Framework              |  `Accepted`  | Fine-grained `resource:action` permission strings                  |
| **[ADR 0026](file:///c:/Projects/kinergy-platform/docs/adr/0026-reusable-security-decorators-architecture.md)**            | Reusable Security Decorators             |  `Accepted`  | `@Public()`, `@Roles()`, `@RequirePermissions()`, `@CurrentUser()` |
| **[ADR 0027](file:///c:/Projects/kinergy-platform/docs/adr/0027-authenticated-request-context-architecture.md)**           | Authenticated Request Context            |  `Accepted`  | `RequestContext` backed by `AsyncLocalStorage`                     |
| **[ADR 0028](file:///c:/Projects/kinergy-platform/docs/adr/0028-extracted-authorization-decision-engine.md)**              | Extracted Authorization Decision Engine  |  `Accepted`  | Thin guard delegating to `DefaultAuthorizationEvaluator`           |
| **[ADR 0029](file:///c:/Projects/kinergy-platform/docs/adr/0029-transport-rate-limiting-architecture.md)**                 | Transport Rate Limiting Architecture     |  `Accepted`  | `@nestjs/throttler` custom limiters                                |
| **[ADR 0031](file:///c:/Projects/kinergy-platform/docs/adr/0031-secure-password-lifecycle-management.md)**                 | Secure Password Lifecycle Management     |  `Accepted`  | `ChangePasswordUseCase` & CSPRNG `ResetPasswordUseCase`            |
| **[ADR 0035](file:///c:/Projects/kinergy-platform/docs/adr/0035-global-validation-and-input-sanitization-pipeline.md)**    | Global Validation & Input Sanitizer      |  `Accepted`  | XSS HTML sanitization & Zod/ValidationPipe                         |
| **[ADR 0036](file:///c:/Projects/kinergy-platform/docs/adr/0036-hardened-password-infrastructure-and-owasp-alignment.md)** | Hardened Password Infrastructure         |  `Accepted`  | Memory-hard Argon2id ($m=64\text{MB}, t=3, p=4$)                   |
| **[ADR 0037](file:///c:/Projects/kinergy-platform/docs/adr/0037-secure-http-defaults-cors-and-helmet-infrastructure.md)**  | Secure HTTP Defaults, CORS & Helmet      |  `Accepted`  | Production Helmet options & environment-driven CORS                |
| **[ADR 0038](file:///c:/Projects/kinergy-platform/docs/adr/0038-authentication-hardening-and-generic-error-handling.md)**  | Auth Hardening & Generic Error Handling  |  `Accepted`  | Generic HTTP 401 error payloads & timing attack defense            |
| **[ADR 0039](file:///c:/Projects/kinergy-platform/docs/adr/0039-reusable-audit-logging-event-infrastructure.md)**          | Audit Logging Infrastructure             |  `Accepted`  | `IAuditEventPublisher` & `SecurityAuditHookService`                |
| **[ADR 0040](file:///c:/Projects/kinergy-platform/docs/adr/0040-distributed-rate-limiting-strategy.md)**                   | Distributed Rate Limiting Strategy       |  `Accepted`  | In-memory throttling for single instance deployment                |
