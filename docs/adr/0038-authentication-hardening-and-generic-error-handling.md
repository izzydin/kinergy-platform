# 0038. Authentication Module Hardening, Information Disclosure Prevention & Startup Secret Validation

- **Status**: Accepted
- **Date**: 2026-07-29
- **Deciders**: Principal Security Engineer, Identity Architecture Team

## Context & Problem Statement

Authentication mechanisms are primary targets for account enumeration, brute-force exploitation, and timing side-channel attacks. Disclosing explicit failure reasons—such as distinguishing between non-existent emails, invalid passwords, or disabled/blocked account statuses—allows attackers to harvest valid user identifiers and evaluate target account states.

Furthermore, relying on implicit developer fallback values for security secrets (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`) or failing to validate configuration during startup introduces deployment vulnerabilities where services execute with compromised or default cryptographic keys.

## Decision Drivers

1. **Information Disclosure Prevention**: Prevent user account harvesting and status enumeration per OWASP Authentication Cheat Sheet.
2. **Timing Attack Mitigation**: Neutralize response latency discrepancies between non-existent and valid user accounts.
3. **Fail-Fast Startup Security**: Validate mandatory security environment variables during application bootstrap, failing fast when secrets are missing or weak.
4. **Zero Fallback Secrets**: Eliminate insecure hardcoded fallback constants in production and non-production code paths.
5. **Auditing & Telemetry Preservation**: Maintain full internal security event logs (`LoginFailed`) for SIEM and intrusion detection.

## Considered Options

- **Option 1**: Return specific error messages (`User not found`, `Account disabled`, `Invalid password`) and rely on client-side filtering.
- **Option 2**: Throw generic exceptions (`InvalidCredentialsException`) returning HTTP 401 Unauthorized with uniform payload (`Invalid email or password.`), perform constant-time dummy Argon2id verifications for missing users, and fail fast during startup on missing/weak secrets.

## Decision Outcome

Chosen Option: **Option 2**.

### Key Architectural Implementation

1. **Generic Authentication Responses**:
   - `LoginUseCase` throws `InvalidCredentialsException('Invalid email or password.')` across all failure scenarios (non-existent email, invalid password, pending, inactive, or blocked account status).
   - `GlobalExceptionFilter` intercepts all authentication exceptions (`InvalidCredentialsException`, `AccountDisabledException`, `AuthException`) and responds with HTTP 401 Unauthorized `{ statusCode: 401, error: "Unauthorized", message: "Invalid email or password." }`.

2. **Latency Side-Channel Timing Attack Mitigation**:
   - When an email lookup returns `null`, `LoginUseCase` executes a dummy Argon2id hash verification (`await this.passwordHasher.verify(password, DUMMY_ARGON2_HASH)`), equalizing execution duration with real user verifications.

3. **Internal Telemetry Preservation**:
   - `LoginUseCase` continues publishing detailed internal `LoginFailed` events (`User not found`, `Account status disabled (BLOCKED)`, `Invalid password`) to `ISecurityEventPublisher` for security monitoring.

4. **Fail-Fast Startup Validation**:
   - `ConfigSecretProvider` implements `OnModuleInit`, executing `onModuleInit()` during NestJS application startup to validate that `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` exist and are $\ge 32$ characters.
   - `envSchema` validates secret lengths via Zod and rejects developer default secrets in `production` mode.
   - Missing or weak secrets throw `SecurityConfigurationException` to immediately terminate process execution before accepting HTTP traffic.

## Consequences

### Positive

- **Complete OWASP Alignment**: Complies with OWASP ASVS 4.0 V2 (Authentication Verification Requirements) and OWASP Authentication Cheat Sheet.
- **Zero Account Enumeration**: Attackers cannot infer email existence or account status from HTTP responses or execution timing.
- **Strict Startup Hygiene**: Eliminates risks of running with missing or default cryptographic secrets.

### Negative

- Client applications must handle single generic `Invalid email or password.` message without specialized UI messages for disabled accounts.
