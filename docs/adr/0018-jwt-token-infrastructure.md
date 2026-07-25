# 18. JWT Token Infrastructure and Encapsulation Architecture

- **Status:** Accepted
- **Date:** 2026-07-25
- **Authors:** Senior Backend Security Engineer & Staff Software Engineer
- **Domain:** Identity & Access Management (IAM)

## Context and Problem Statement

Stateless authentication in the Kinergy Platform requires minting and verifying short-lived Access Tokens and Refresh Tokens.

To maintain **Clean Architecture** and **Hexagonal Architecture**:

1. Domain and Application layers must NEVER directly depend on third-party JWT signing libraries (`jsonwebtoken`, `@nestjs/jwt`).
2. Secrets must be abstracted behind a `SecretProvider` interface reading environment variables (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`) without hardcoding values in codebase files.
3. Claims payloads must be strongly typed, supporting current user identity fields while providing backward-compatible extension hooks for future multi-tenant SaaS features (`tenantId`, `organizationId`, `sessionId`, `mfaState`).

## Decision Drivers

- Strict separation of concern between business use cases and infrastructure security frameworks.
- Zero raw `JwtService` coupling outside the infrastructure layer.
- Clean claim payload contracts (`IAccessTokenPayload` and `IRefreshTokenPayload`).
- Support for Refresh Token Rotation (RTR) via `familyId` and `jti` claim generation.

## Decision Outcome

Chosen Option: **Isolated Token Subsystem comprising `ISecretProvider`, `ITokenFactory` (`JwtTokenFactory`), `IAccessTokenService`, and `IRefreshTokenService`**.

### Key Architectural Guidelines

1. **Secret Provider Abstraction (`ISecretProvider` & `ConfigSecretProvider`)**
   - Interface `ISecretProvider` bound to NestJS symbol `SECRET_PROVIDER`.
   - Reads `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRES_IN` (15m), `JWT_REFRESH_EXPIRES_IN` (7d), `JWT_ISSUER`, `JWT_AUDIENCE` from `@nestjs/config`.

2. **Token Factory Port & Adapter (`ITokenFactory` & `JwtTokenFactory`)**
   - Interface `ITokenFactory` bound to NestJS symbol `TOKEN_FACTORY`.
   - Encapsulates `jsonwebtoken` library within infrastructure layer.
   - Low-level methods: `createAccessToken()`, `verifyAccessToken()`, `createRefreshToken()`, `verifyRefreshToken()`.

3. **High-Level Application Services (`AccessTokenService` & `RefreshTokenService`)**
   - `AccessTokenService`: Mints and validates Access Tokens bound to `IUserIdentity` claims (`sub`, `email`, `roles`, `permissions`, `tokenVersion`, `tenantId`, `jti`).
   - `RefreshTokenService`: Mints signed JWT refresh tokens with RTR claims (`familyId`, `jti`), validates tokens, and generates high-entropy 256-bit CSPRNG opaque random strings (`generateOpaqueToken()`).

## Consequences

### Positive

- **Encapsulated Infrastructure:** Swapping JWT libraries or signing algorithms (e.g. migrating from HS256 to asymmetric RS256/Ed25519) requires modifying only `JwtTokenFactory` without touching application services or controllers.
- **Auditable Claim Payloads:** All token claims are strictly typed, prevent missing claim bugs, and support future multi-tenant claims seamlessly.
- **High Testability:** Fully testable using mock secret providers without booting NestJS HTTP contexts.

### Negative

- Requires small DTO transformation layers between raw JWT claims and application identity contexts.
