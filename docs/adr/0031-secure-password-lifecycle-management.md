# 31. Secure Password Lifecycle Management Architecture

- **Status:** Accepted
- **Date:** 2026-07-27

## Context and Problem Statement

Password state changes (User Change Password, Admin Reset Password) are high-risk security operations. Insecure handling during password changes can leak plaintext passwords, fail to invalidate active stolen sessions, or bypass password complexity rules. A complete lifecycle implementation must reuse Argon2id hashing, PasswordPolicyService validation, security telemetry event publishers, and token invalidation.

## Decision Drivers

- **Zero Plaintext Password Exposure**: Plaintext passwords are processed exclusively in memory during validation/hashing and are never written to logs, security event metadata, or persistent storage.
- **Immediate Session Invalidation**: Executing `changePassword(newHash)` on the `User` aggregate root automatically purges `hashedRefreshToken` and increments `tokenVersion`, invalidating every active JWT session.
- **Cryptographically Secure Temporary Passwords**: Admin password resets utilize `TemporaryPasswordGeneratorService` using Node.js `crypto.randomInt` and Fisher-Yates shuffling, guaranteeing strict compliance with `PasswordPolicyService` rules.
- **Audit Event Telemetry**: Emits `PasswordChanged` and `PasswordResetByAdmin` events through `ISecurityEventPublisher`.

## Decision Outcome

Chosen Option: **Unified Domain Method `User.changePassword()` with Encapsulated Use Cases (`ChangePasswordUseCase`, `ResetPasswordUseCase`)**.

### Password Change Security Pipeline

```
Client / Admin Request
       │
       ▼
Password Use Case
  1. Verify current password (Argon2id verify)
  2. Validate new candidate (PasswordPolicyService)
  3. Verify candidate differs from current password
       │
       ▼
User.changePassword(newHash)
  1. Update _passwordHash
  2. Invalidate refresh token (clearRefreshToken)
  3. Revoke active JWTs (incrementTokenVersion)
       │
       ▼
Persist (IUserRepository.save) & Publish Security Event (PasswordChanged / PasswordResetByAdmin)
```

## Consequences

### Positive

- OWASP Password Storage & Authentication Cheat Sheet compliant.
- Guaranteed automatic revocation of active user sessions across device clusters upon password mutation.
- Clean separation of concern: zero duplication of hashing or policy validation rules.
- 100% unit test coverage validating password verification, policy enforcement, token invalidation, and telemetry emission.
