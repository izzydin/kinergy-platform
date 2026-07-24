# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- NestJS backend application in `apps/api` with Helmet, Compression, CORS, Swagger OpenAPI UI, Global Validation Pipe, ConfigModule, environment validation, logging, and graceful shutdown.
- Architectural Decision Record (`docs/adr/0007-nestjs-application-scaffolding.md`).
- Docker local development foundation (`docker-compose.yml`, `.env.example`, `.env`, `infrastructure/docker/init-db.sql`) with PostgreSQL 16, Adminer, healthchecks, and persistent volumes.
- Architectural Decision Record (`docs/adr/0006-docker-local-development-infrastructure.md`).
- GitHub Actions CI workflow (`.github/workflows/ci.yml`) validating format, lint, typecheck, test, and build on PRs and main branch pushes.
- Architectural Decision Record (`docs/adr/0005-ci-cd-github-actions-workflow.md`).
- Workspace development tooling setup (ESLint flat config, Prettier, Husky, lint-staged, Commitlint).
- Workspace npm scripts (`lint`, `format`, `format:check`, `typecheck`, `test`, `build`, `prepare`).
- Architectural Decision Record (`docs/adr/0004-workspace-development-tooling.md`).
- Nx Integrated Workspace setup configured with `pnpm`.
- `nx.json`, `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.editorconfig`, `.nvmrc`.
- Initial GitHub repository structure for `kinergy-platform`.
- Standard governance documentation (`README.md`, `LICENSE`, `CODEOWNERS`, `CONTRIBUTING.md`, `SECURITY.md`).
- Architectural Decision Records (`docs/adr/0001-record-architecture-decisions.md`, `docs/adr/0002-nx-monorepo-clean-architecture-ddd.md`, `docs/adr/0003-nx-integrated-workspace-pnpm.md`).
- Directory structure prepared for Nx monorepo (`apps/`, `libs/`, `docs/adr/`, `.github/`).
