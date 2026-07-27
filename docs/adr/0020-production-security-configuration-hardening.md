# 20. Production Security Configuration Hardening

- **Status:** Accepted
- **Date:** 2026-07-27

## Context and Problem Statement

To prevent unauthorized token forgery and deployment of insecure default secrets to production environments, we require a fail-fast security configuration enforcement policy for JWT credentials and system secrets.

## Decision Drivers

- **Zero Insecure Defaults in Production**: Hardcoded development secrets must never be used or allowed in `production` environments.
- **Fail-Fast Application Startup**: Missing or weak security parameters (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`) must abort application initialization immediately.
- **Clean Architecture Isolation**: Configuration management must remain isolated behind the `ISecretProvider` port interface (`SECRET_PROVIDER`) without leaking framework-specific `ConfigService` throughout business logic.
- **Developer Experience**: Non-production environments (`development`, `test`) may fall back to documented development default secrets with logged security warnings.

## Decision Outcome

Chosen Option: **Fail-Fast Security Validation in `ConfigSecretProvider` & Centralized Zod Schema (`validateEnv`)**.

### Security Configuration Policy

1. **Production Mode (`NODE_ENV === 'production'`)**:
   - `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` must be set via environment variables.
   - Secrets must be at least 32 characters long.
   - If missing or insecure, `ConfigSecretProvider` throws a fatal `SecurityConfigurationException`, immediately aborting application startup.
2. **Development / Test Mode**:
   - If secrets are set in `.env`, they are used.
   - If missing, `ConfigSecretProvider` issues a runtime logger warning and uses explicitly documented developer fallback secrets.

## Consequences

### Positive

- Zero risk of launching a production environment using hardcoded development JWT secrets.
- Early detection of missing secrets during deployment / container startup.
- Full test coverage for valid configuration, non-production fallback behavior, and production startup exceptions.
