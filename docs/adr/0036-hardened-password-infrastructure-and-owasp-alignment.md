# 36. Hardened Password Infrastructure, Centralized Security Policy, and OWASP Storage Alignment

- **Status:** Accepted
- **Impact Level:** Critical (Identity & Authentication Security)
- **Date:** 2026-07-29

## Context and Problem Statement

Password infrastructure across enterprise Identity & Access Management (IAM) systems must strictly satisfy OWASP Password Storage Guidelines (RFC 9106) and NIST SP 800-63B standards. Previously, password policy limits, Argon2id parameters, and temporary credential lengths contained hardcoded defaults embedded inside domain services (`Argon2PasswordHasher`, `PasswordPolicyService`, `TemporaryPasswordGeneratorService`).

Furthermore, password reuse prevention was limited to comparing candidate passwords against the active single password hash string, which allowed users to rotate back to recently used passwords. To elevate platform identity security to enterprise standards, all password policies and hashing parameters must be centrally configurable without hardcoded security values, while supporting rolling password history verification, CSPRNG temporary credentials, and security audit telemetry.

## Decision Drivers

1. **OWASP & NIST SP 800-63B Standards**: Hashing must use memory-hard Argon2id (RFC 9106); policy must enforce minimum lengths (>=12 characters) and high maximum lengths (128-256 characters) to prevent DoS via huge payloads while allowing long passphrases.
2. **Zero Hardcoded Security Values**: All security parameters must be centrally defined, typed, and validated via Zod (`envSchema`) and injected through NestJS Dependency Injection ports (`IPasswordPolicyConfiguration`).
3. **Password Reuse Prevention**: System must maintain a rolling $N$-hash password history array in the `User` domain entity (`passwordHistory: string[]`) and verify candidate passwords against all historical hashes using Argon2id.
4. **CSPRNG Temporary Credentials**: Temporary passwords generated for admin resets must use Node.js `crypto.randomInt` and Fisher-Yates secure shuffle while respecting dynamic policy options.
5. **Session Revocation & Auditability**: Password reset and change operations must invalidate active refresh token families (`clearRefreshToken()`, `incrementTokenVersion()`) and publish structured security telemetry events.

## Considered Options

1. **Option 1 (Legacy)**: Hardcoded defaults inside `Argon2PasswordHasher` and `PasswordPolicyService`, no password history tracking.
2. **Option 2 (Chosen)**: Centralized `IPasswordPolicyConfiguration` port backed by Zod environment schema, rolling Argon2id password reuse window ($N$=5), CSPRNG temporary password generation, and active session purging.

## Decision Outcome

Chosen Option: **Option 2**.

### Architecture Overview

```
                          ┌────────────────────────────┐
                          │    env.validation.ts       │
                          │   (Zod Schema Validation)  │
                          └─────────────┬──────────────┘
                                        │
                                        ▼
                   ┌──────────────────────────────────────────┐
                   │    ConfigPasswordPolicyConfiguration     │
                   │    (IPasswordPolicyConfiguration Port)   │
                   └────────────────────┬─────────────────────┘
                                        │
             ┌──────────────────────────┼──────────────────────────┐
             ▼                          ▼                          ▼
┌─────────────────────────┐  ┌────────────────────┐  ┌─────────────────────────────┐
│  Argon2PasswordHasher   │  │PasswordPolicyServ. │  │TemporaryPasswordGenerator   │
│  (m=64MB, t=3, p=4)     │  │(Min 12, Max 128)  │  │(CSPRNG + Fisher-Yates)      │
└────────────┬────────────┘  └──────────┬─────────┘  └──────────────┬──────────────┘
             │                          │                           │
             └──────────────────────────┼───────────────────────────┘
                                        ▼
                      ┌────────────────────────────────────┐
                      │    ChangePassword / ResetPassword  │
                      │   Use Cases & User Domain Entity   │
                      │  (Rolling N-Hash Reuse Check)      │
                      └────────────────────────────────────┘
```

### Detailed Component Architecture

1. **Centralized Configuration (`IPasswordPolicyConfiguration`)**
   - Environment variables validated by Zod in `env.validation.ts`:
     - `ARGON2_MEMORY_COST`: Minimum 15360 KB (15 MB), default 65536 KB (64 MB).
     - `ARGON2_TIME_COST`: Minimum 1, default 3 iterations.
     - `ARGON2_PARALLELISM`: Minimum 1, default 4 threads.
     - `ARGON2_HASH_LENGTH`: Minimum 16 bytes, default 32 bytes.
     - `PASSWORD_MIN_LENGTH`: 8 to 128 characters, default 12.
     - `PASSWORD_MAX_LENGTH`: 32 to 256 characters, default 128.
     - `PASSWORD_REQUIRE_UPPERCASE`, `PASSWORD_REQUIRE_LOWERCASE`, `PASSWORD_REQUIRE_NUMBER`, `PASSWORD_REQUIRE_SPECIAL_CHAR`: Configurable boolean rules.
     - `PASSWORD_HISTORY_LIMIT`: Rolling history bound (0 to 24), default 5.

2. **Argon2id Hashing Adapter (`Argon2PasswordHasher`)**
   - Strictly applies RFC 9106 Argon2id parameters resolved from `IPasswordPolicyConfiguration`.
   - Preserves fallback constant-time verification for legacy database seed hashes (`$pbkdf2-sha512$`).

3. **Password Complexity & Input Validation (`PasswordPolicyService`)**
   - Validates character composition, min/max length, and null-byte/control character rejection.
   - Calculates character count accurately across Unicode strings (`Array.from(password).length`).

4. **Rolling Password Reuse Prevention (`User` Domain Entity & `ChangePasswordUseCase`)**
   - `User` entity maintains `passwordHistory: string[]`.
   - On password change/reset, current `passwordHash` is pushed to `passwordHistory`, bounded by `PASSWORD_HISTORY_LIMIT`.
   - `ChangePasswordUseCase` executes `passwordHasher.verify(newPassword, historicalHash)` across all stored historical hashes to prevent password reuse.

5. **Temporary Password Generation & Password Reset Flow**
   - `TemporaryPasswordGeneratorService` uses Node.js `crypto.randomInt` to sample from character sets and perform a Fisher-Yates shuffle.
   - `ResetPasswordUseCase` generates a temporary password of `max(16, minLength + 4)` characters, hashes it via Argon2id, invalidates active user refresh tokens, and publishes `PasswordResetByAdmin` telemetry.

## OWASP Password Storage Compliance Self-Review

| OWASP Recommendation       | Implementation Status | Evidence / Verification                                                             |
| :------------------------- | :-------------------- | :---------------------------------------------------------------------------------- |
| **Algorithm**              | **PASSED**            | Uses Argon2id (`argon2.argon2id`) via `Argon2PasswordHasher`.                       |
| **Memory Cost**            | **PASSED**            | Default 64 MiB (`m=65536`), configurable via `ARGON2_MEMORY_COST`.                  |
| **Time Cost / Iterations** | **PASSED**            | Default 3 iterations (`t=3`), configurable via `ARGON2_TIME_COST`.                  |
| **Parallelism**            | **PASSED**            | Default 4 threads (`p=4`), configurable via `ARGON2_PARALLELISM`.                   |
| **Minimum Length**         | **PASSED**            | Default 12 characters, configurable via `PASSWORD_MIN_LENGTH`.                      |
| **Maximum Length**         | **PASSED**            | Default 128 characters, configurable via `PASSWORD_MAX_LENGTH` (prevents DoS).      |
| **Allowed Characters**     | **PASSED**            | Allows spaces and all printable ASCII/UTF-8 characters. Rejects control bytes.      |
| **Password Reuse**         | **PASSED**            | Rolling $N$-hash history window (`PASSWORD_HISTORY_LIMIT=5`) verified via Argon2id. |
| **Temporary Passwords**    | **PASSED**            | CSPRNG `crypto.randomInt` generation with Fisher-Yates shuffle.                     |
| **Zero Hardcoded Values**  | **PASSED**            | Centralized in `env.validation.ts` and `IPasswordPolicyConfiguration`.              |

## Related ADRs

- [ADR 0014](file:///c:/Projects/kinergy-platform/docs/adr/0014-zod-validated-application-configuration.md): Zod-Validated Application Configuration
- [ADR 0017](file:///c:/Projects/kinergy-platform/docs/adr/0017-password-infrastructure-argon2id.md): Password Hashing Infrastructure Argon2id
- [ADR 0031](file:///c:/Projects/kinergy-platform/docs/adr/0031-secure-password-lifecycle-management.md): Secure Password Lifecycle Management Architecture
