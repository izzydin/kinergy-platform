# 5. CI/CD GitHub Actions Workflow

- **Status:** Accepted
- **Date:** 2026-07-24

## Context and Problem Statement

To prevent regressions, enforce formatting standards, and ensure type safety, unit test pass rates, and build integrity across all pull requests and commits to `main`, we require an automated continuous integration pipeline.

## Decision Drivers

- Automated quality gates for every Pull Request targeting `main`.
- Continuous validation on push to `main`.
- Deterministic builds utilizing `pnpm` and pinned Node.js runtime (`.nvmrc`).
- Enforcing full static checking (`format:check`, `lint`, `typecheck`, `test`, `build`) before code can be merged.

## Decision Outcome

Chosen Option: **GitHub Actions CI Workflow (`.github/workflows/ci.yml`)**.

### Pipeline Steps

1. **Checkout Repository**: Fetches complete commit history (`fetch-depth: 0`).
2. **Environment Setup**: Configures Node.js from `.nvmrc` and `pnpm` with dependency caching.
3. **Install Dependencies**: Executes `pnpm install --frozen-lockfile`.
4. **Validations**:
   - `pnpm validate` (executes `format:check`, `lint`, `typecheck`, `test`, `build` sequentially via `npm-run-all2`)

## Consequences

### Positive

- Zero manual testing needed to verify PR compliance with baseline standards.
- Early detection of broken builds, lint failures, or type errors.
- Clean integration with GitHub pull request status checks.
