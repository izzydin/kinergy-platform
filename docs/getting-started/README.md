# Developer Getting Started & Onboarding Guide

- **Status:** Active
- **Target Audience:** Platform Engineers, Security Reviewers, & Front-End Developers
- **Prerequisites:** Node.js (v20+), pnpm (v9+), Docker & Docker Compose

---

## 1. Quick Start

Follow these steps to set up and run the Kinergy Platform locally in less than 5 minutes:

### Step 1: Clone Repository & Install Dependencies

```bash
git clone https://github.com/izzydin/kinergy-platform.git
cd kinergy-platform
pnpm install
```

### Step 2: Configure Local Environment

Copy the default local environment file:

```bash
cp .env.example .env
```

### Step 3: Launch Local Docker Infrastructure

Start the local PostgreSQL database instance:

```bash
pnpm docker:up
```

### Step 4: Run Prisma Database Migrations & Seeds

```bash
pnpm prisma:migrate:dev
pnpm prisma:seed
```

### Step 5: Start Local Development Servers

Start the API (`apps/api`) and Web (`apps/web`) development servers concurrently via Nx:

```bash
pnpm dev
```

- **API Server:** `http://localhost:3000/api/v1`
- **Swagger Documentation:** `http://localhost:3000/api/docs`
- **Web App:** `http://localhost:5173`

---

## 2. Quality Gate Verification

Before committing changes or creating pull requests, execute the automated quality gate pipeline:

```bash
pnpm validate
```

This runs in sequence:

1. `pnpm format:check` (Prettier code style verification)
2. `nx run-many -t lint` (ESLint across all 8 workspace projects)
3. `nx run-many -t typecheck` (TypeScript compilation check)
4. `nx run-many -t test` (Jest unit & integration test suites)
5. `nx run-many -t build` (Production compilation build across all projects)

---

## 3. Recommended Developer Resources

- [Architecture Overview](file:///c:/Projects/kinergy-platform/docs/architecture/README.md)
- [Centralized Configuration Guide](file:///c:/Projects/kinergy-platform/docs/configuration/README.md)
- [Security Architecture Specification](file:///c:/Projects/kinergy-platform/docs/security/README.md)
- [Enterprise Testing Strategy](file:///c:/Projects/kinergy-platform/docs/testing/README.md)
- [API Reference Guide](file:///c:/Projects/kinergy-platform/docs/api/README.md)
- [Glossary & Domain Terms](file:///c:/Projects/kinergy-platform/docs/glossary.md)
