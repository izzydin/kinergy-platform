# 3. Nx Integrated Workspace Setup with pnpm

- **Status:** Accepted
- **Date:** 2026-07-24

## Context and Problem Statement

To support multi-application development, domain modularity, efficient package resolution, and strict TypeScript rules across the Kinergy Platform, we require a standardized monorepo workspace configuration.

## Decision Drivers

- Fast, deterministic dependency resolution.
- Native disk space optimization and strict node_modules handling.
- Seamless project graph visualization and task caching via Nx.
- Strict TypeScript compiler policies (`strict: true`, `noImplicitAny: true`, `noUncheckedIndexedAccess: true`).

## Decision Outcome

Chosen Option: **Nx Integrated Workspace using `pnpm` as the package manager**.

### Configurations Adopted

1. **`pnpm-workspace.yaml`**: Defines workspace packages under `apps/*`, `libs/*`, and `libs/*/*`.
2. **`nx.json`**: Configures integrated layout (`appsDir: "apps"`, `libsDir: "libs"`), named inputs (`default`, `production`), and cached targets (`build`, `test`, `lint`).
3. **`tsconfig.base.json`**: Implements strict compiler flags and path aliases.
4. **`.nvmrc`**: Pins Node.js version to 24.
5. **`.editorconfig`**: Standardizes code style (LF line endings, 2 spaces, UTF-8).

## Consequences

### Positive

- Strict dependency isolation prevents phantom dependencies.
- Native performance and fast caching across Nx tasks.
- `pnpm nx graph` visualizes workspace dependencies cleanly.
