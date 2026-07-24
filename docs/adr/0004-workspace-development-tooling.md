# 4. Workspace Development Tooling Setup

- **Status:** Accepted
- **Date:** 2026-07-24

## Context and Problem Statement

To maintain high code quality, consistent code style, strict TypeScript safety (enforcing zero `any`), automated git commit messaging rules, and pre-commit checks across the Kinergy Platform monorepo, we require a standardized suite of development tools.

## Decision Drivers

- Enforcing strict static analysis and TypeScript rules before commits are accepted.
- Automated code formatting across HTML, JSON, Markdown, YAML, JavaScript, and TypeScript.
- Standardizing Git commit messages via Conventional Commits.
- Ensuring zero breaking style or type errors enter the repository.

## Decision Outcome

Chosen Option: **Integrated ESLint flat config, Prettier, Husky, lint-staged, and Commitlint**.

### Tooling Suite Adopted

1. **ESLint (`eslint.config.js`)**: Modern flat config incorporating `@typescript-eslint` rules. Strictly forbids `any` (`@typescript-eslint/no-explicit-any: error`).
2. **Prettier (`.prettierrc`, `.prettierignore`)**: Standardizes code formatting (single quotes, trailing commas, 2 spaces indent, LF line endings, 100 print width).
3. **Commitlint (`.commitlintrc.json`)**: Validates commit messages against Conventional Commits specification.
4. **Husky & lint-staged (`.husky/pre-commit`, `.husky/commit-msg`, `.lintstagedrc.json`)**: Runs `prettier --write` on staged files before commit and validates commit message format.
5. **Workspace Scripts**: Standardizes `pnpm lint`, `pnpm format`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

## Consequences

### Positive

- Consistent developer experience across all apps and packages in the monorepo.
- Automated enforcement of strict TypeScript quality standards.
- Cleaner Git history with formatted messages and code.
