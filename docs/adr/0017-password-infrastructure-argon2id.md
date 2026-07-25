# 17. Argon2id Password Infrastructure and Complexity Validation Engine

- **Status:** Accepted
- **Date:** 2026-07-25
- **Authors:** Principal Security Engineer & Staff Software Engineer
- **Domain:** Identity & Access Management (IAM)

## Context and Problem Statement

The Kinergy Platform requires a secure, production-grade password infrastructure to protect local user credentials against offline GPU/ASIC cracking attacks and credential stuffing threats.

To maintain Clean Architecture and Hexagonal Architecture principles:

1. Application and Domain layers must never directly import or depend on third-party hashing libraries (`argon2`, `bcrypt`).
2. Password validation policies must be reusable, configurable, and compliant with NIST SP 800-63B guidelines.
3. The hashing adapter must support transparent verification of legacy and database seed hashes (such as PBKDF2) without breaking active user authentications during future algorithm migrations.

## Decision Drivers

- Resistance against GPU/ASIC offline dictionary and rainbow table cracking.
- Adherence to OWASP ASVS 4.0 and NIST SP 800-63B recommendations.
- Strict Clean Architecture decoupling via Port & Adapter interfaces (`IPasswordHasher`).
- Safe backwards-compatible hash verification across algorithm upgrades.

## Decision Outcome

Chosen Option: **Argon2id Hashing Adapter (`Argon2PasswordHasher`) behind an explicit Port interface (`IPasswordHasher`), paired with a configurable `PasswordPolicyService`**.

### Key Architectural Guidelines

1. **Port Abstraction (`IPasswordHasher`)**
   - Pure TypeScript interface located in `apps/api/src/platform/identity/password/`.
   - Methods: `hash(password: string): Promise<string>` and `verify(password: string, hash: string): Promise<boolean>`.
   - Dependency injection symbol: `PASSWORD_HASHER`.

2. **Argon2id Infrastructure Adapter (`Argon2PasswordHasher`)**
   - Hashing algorithm: **Argon2id** (winner of the Password Hashing Competition, RFC 9106).
   - Parameters:
     - Memory Cost ($m$): $65,536\text{ KB}$ ($64\text{ MB}$).
     - Time Iterations ($t$): $3$ passes.
     - Parallelism ($p$): $4$ threads.
     - Hash Output Length: $32\text{ bytes}$.
     - Salt Length: $16\text{ bytes}$ (CSPRNG generated per-password).
   - **Algorithm Migration & Multi-Hash Support:** Native verification handles `$argon2id$` hashes via `argon2.verify()`, while detecting legacy/seed `$pbkdf2-sha512$` hashes and executing fallback verification safely without panicking.

3. **Configurable Password Policy Engine (`PasswordPolicyService`)**
   - Configurable rules: Minimum length (default 12), maximum length (128), uppercase, lowercase, numbers, and special characters.
   - Structured error reporting returning `PasswordValidationResult` or throwing `PasswordValidationError`.

## Consequences

### Positive

- **State-of-the-Art Security:** Argon2id memory hardness effectively paralyzes high-throughput GPU/ASIC cracking attempts.
- **Framework & Infrastructure Decoupling:** Core domain logic depends only on `IPasswordHasher`, enabling seamless swapping of hashing implementations in tests or future hardware security modules (HSMs).
- **Graceful Migration:** Supports verifying existing database seed hashes (`$pbkdf2-sha512$`) alongside new Argon2id hashes.

### Negative

- **Server Memory Allocation:** 64 MB per Argon2id hashing operation requires CPU/Memory rate-limiting on registration/password reset routes under high load.
