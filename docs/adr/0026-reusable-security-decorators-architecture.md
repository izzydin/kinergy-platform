# 26. Reusable Security Decorators Architecture

- **Status:** Accepted
- **Date:** 2026-07-27

## Context and Problem Statement

To provide a developer-friendly DX across HTTP controllers in `apps/api`, endpoints require clean, declarative security annotations (`@CurrentUser()`, `@Public()`, `@Roles()`, `@Permissions()`). These decorators must abstract framework internals and contain **metadata or parameter extraction only**, delegating all validation, user lookup, and authorization rules to NestJS guards and application services.

## Decision Drivers

- **Zero Business Logic in Decorators**: Decorators attach metadata keys (`isPublic`, `roles`, `permissions`) or extract request parameters (`@CurrentUser()`); zero evaluation or DB access exists inside decorators.
- **Strongly Typed User Parameter Extraction**: `@CurrentUser()` extracts full identity payload or specific properties (`@CurrentUser('id')`, `@CurrentUser('email')`) with strict TypeScript types.
- **Future Extensibility**: Metadata structure allows seamless addition of future security decorators (`@Tenant()`, `@RequiresOwnership()`, `@Policy()`, `@FeatureFlag()`) without breaking existing endpoints.

## Decision Outcome

Chosen Option: **Centralized security decorators in `platform/identity/decorators` re-exported across identity sub-modules**.

### Security Decorators Taxonomy

| Decorator                    | Usage Scope    | Function                                                                                    |
| :--------------------------- | :------------- | :------------------------------------------------------------------------------------------ |
| `@CurrentUser()`             | Parameter      | Extracts authenticated `AuthenticatedUserPayload` or specific property (`'id'`, `'email'`). |
| `@Public()`                  | Method / Class | Sets `isPublic = true` metadata to bypass `AuthenticationGuard`.                            |
| `@Roles('ADMIN')`            | Method / Class | Sets `roles` array metadata for `AuthorizationGuard` evaluation.                            |
| `@Permissions('read:users')` | Method / Class | Sets `permissions` array metadata for `AuthorizationGuard` evaluation.                      |

## Consequences

### Positive

- Clean, readable controller code free of manual request parameter casting or `Reflector` calls.
- High architectural cohesion: guards evaluate metadata; decorators set metadata.
- 100% unit test coverage validating metadata reflection and parameter extraction.
