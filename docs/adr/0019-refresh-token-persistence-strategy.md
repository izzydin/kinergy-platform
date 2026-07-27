# 19. Refresh Token Persistence & Security Strategy

- **Status:** Accepted
- **Date:** 2026-07-27

## Context and Problem Statement

To prevent long-lived credential compromise, support secure session management, and enable token revocation across single or multiple devices, we require a robust, cryptographically secure Refresh Token persistence architecture.

## Decision Drivers

- **Security Boundary**: Raw refresh tokens must never be persisted in plain text in database tables or server logs.
- **Cryptographic Security**: Only hashed refresh tokens (SHA-256) are stored.
- **Session Lifecycle & Extensibility**: Support token rotation, token family tracking, revocation, and replay attack mitigation.
- **Future Extensibility**: Seamlessly support future multi-device management, device identifiers, session metadata, IP tracking, and audit logs without architectural or schema refactoring.

## Decision Outcome

Chosen Option: **Dedicated `RefreshToken` Persistence Table & Domain Entity (`refresh_tokens`)**.

### Comparative Analysis: Dedicated Table vs. Hashed Token on User

| Architectural Criterion          | Dedicated `RefreshToken` Table (Selected)                                                                | Hashed Token on `User` (Rejected)                                          |
| :------------------------------- | :------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------- |
| **Multi-Device / Multi-Session** | Supports $N$ active sessions per user cleanly.                                                           | Restricts user to 1 global session (logging in on mobile invalidates web). |
| **Replay Attack Mitigation**     | Tracks token families (`familyId`). Instantly revokes entire family on reused token attempt.             | Impossible to detect replay vs legitimate rotation.                        |
| **Granular Revocation**          | Revoke single session, family, or all sessions for a user.                                               | Binary revocation (revokes all user tokens indiscriminately).              |
| **Schema Extensibility**         | Future fields (`deviceId`, `ipAddress`, `userAgent`) attach to session records without polluting `User`. | Pollutes core `User` model with transient session attributes.              |
| **Database Performance**         | Fast $O(1)$ indexed lookups on `token_hash` and `family_id`.                                             | Single string column on user table.                                        |

### Security Mechanisms Implemented

1. **Cryptographic Hashing**: Raw tokens are hashed via SHA-256 (`Sha256TokenHasher`) prior to persistence. Indexed lookups operate on 256-bit hashes (`token_hash`).
2. **Token Family Rotation**: Every refresh token belongs to a `familyId`. Rotating a token invalidates the old record and issues a new child token within the same family.
3. **Replay Attack Mitigation**: If a previously revoked or rotated token is presented, the system detects a token reuse/replay attack and immediately invalidates all tokens in the `familyId`.
4. **Expiration Validation**: Expired tokens are marked revoked or deleted via background cleanup without affecting user records.

## Consequences

### Positive

- High-entropy cryptographic protection against database breach leaks.
- Zero architectural refactoring required for future multi-device, session tracking, or audit log extensions.
- Comprehensive unit test coverage across pure domain entities, ports, and use cases.
