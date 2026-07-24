# 9. Shared Workspace Packages in `packages/`

- **Status:** Accepted
- **Date:** 2026-07-24

## Context and Problem Statement

To prevent code duplication, standardize cross-cutting concerns, and enable clean module consumption across applications (`apps/api` and `apps/web`), we require modular shared packages with global TypeScript path mappings.

## Decision Drivers

- Enforcing DRY (Don't Repeat Yourself) principles across frontend and backend applications.
- Clean TypeScript barrel exports (`index.ts`) defining clear public library APIs.
- Nx dependency graph tracking for incremental builds and test caching.
- Strictly decoupled, framework-agnostic utilities and types.

## Decision Outcome

Chosen Option: **Nx Shared Libraries in `packages/` mapped via `@kinergy-platform/*` path aliases**.

### Created Packages & Mappings

1. **`@kinergy-platform/ui` (`packages/ui`)**: Component contracts, theme properties, and design primitives.
2. **`@kinergy-platform/types` (`packages/types`)**: Core TypeScript interfaces, primitives (`Nullable`, `Optional`, `Result`, `EntityId`), and domain object contracts.
3. **`@kinergy-platform/utils` (`packages/utils`)**: Pure helper functions (`formatDate`, `isNonEmptyString`).
4. **`@kinergy-platform/config` (`packages/config`)**: Shared platform constants (`APP_CONFIG`).
5. **`@kinergy-platform/validation` (`packages/validation`)**: Validation assertion primitives (`createSuccessValidation`, `createFailureValidation`).

## Consequences

### Positive

- Unified `@kinergy-platform/*` imports across all applications.
- Clean boundary separation with explicit `project.json` targets.
- Zero UI component pollution in the baseline scaffold.
