# Containerization and Reproducible Build Specification Guide

**Milestone:** 10.2 — Docker Packaging and Reproducible Build Specification  
**Classification:** DevOps / Systems Architecture Specification  
**Status:** Approved & Implementation-Ready  
**Related ADR:** [ADR-0141: Docker Packaging and Reproducible Build Specification](../adr/0141-docker-packaging-and-reproducible-build-specification.md)

---

## 1. Executive Summary

This document defines the container architecture, build reproducibility requirements, filesystem layout, security policies, and local verification procedures for packaging the **Kinergy Platform** into production OCI container images.

The platform comprises two deliverable application images:

1. **`kinergy-api`**: NestJS 10 backend running on Node.js 24 LTS, utilizing Prisma ORM (PostgreSQL 16) and native Argon2id password hashing.
2. **`kinergy-web`**: React 18 / Vite 5 Single Page Application (SPA) served via an unprivileged Nginx web server configured with HTML5 history routing and reverse proxy capabilities for `/api/v1`.

---

## 2. Base Image Selection & Version Policy

To achieve build determinism and prevent breaking changes from upstream image drift:

### 2.1 Pinned Base Images

| Component        | Stage           | Base Image                                     | Architecture                 | Digest / Version Policy                    | Rationale                                                                                                                      |
| :--------------- | :-------------- | :--------------------------------------------- | :--------------------------- | :----------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------- |
| **API Backend**  | Build & Runtime | `node:24.12.0-bookworm-slim`                   | `linux/amd64`, `linux/arm64` | Pinned exact patch release & SHA256 digest | Standard `glibc` OpenSSL 3.0 runtime. Native C++ compilation for `argon2` and native Linux query engine for `@prisma/client`.  |
| **Web Frontend** | Build           | `node:24.12.0-bookworm-slim`                   | `linux/amd64`, `linux/arm64` | Pinned exact patch release & SHA256 digest | Monorepo parity for Vite build and TypeScript compilation.                                                                     |
| **Web Frontend** | Runtime         | `nginxinc/nginx-unprivileged:1.27-alpine-slim` | `linux/amd64`, `linux/arm64` | Pinned minor version & SHA256 digest       | Compact ($\approx 15\text{ MB}$), runs natively as unprivileged user `nginx` (UID 101), high performance static file delivery. |

### 2.2 Floating Tag Prohibition

- **STRICT PROHIBITION:** Tags such as `node:latest`, `node:24`, `node:alpine`, `nginx:latest`, or `adminer:latest` are strictly prohibited in production build files.
- Every `FROM` instruction must specify the explicit version tag and SHA256 image digest.

---

## 3. Multi-Stage Build Specifications

### 3.1 Backend Container Architecture (`Dockerfile.api`)

The build context is the **monorepo root** (`.`).

```dockerfile
# ==============================================================================
# Stage 1: Base Runtime Environment
# ==============================================================================
FROM node:24.12.0-bookworm-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    tini \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable pnpm && corepack prepare pnpm@11.17.0 --activate

# ==============================================================================
# Stage 2: Workspace Dependencies (Compiled Native Bindings)
# ==============================================================================
FROM base AS dependencies
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY modules/client/package.json ./modules/client/
COPY packages/core/package.json ./packages/core/

RUN pnpm install --frozen-lockfile

# ==============================================================================
# Stage 3: Application Builder
# ==============================================================================
FROM dependencies AS builder
WORKDIR /app

COPY prisma ./prisma
RUN pnpm prisma generate

COPY tsconfig.base.json nx.json ./
COPY apps/api ./apps/api
COPY packages ./packages
COPY modules ./modules

RUN pnpm nx run-many -t build -p api core client-domain

# ==============================================================================
# Stage 4: Production Dependency Pruning
# ==============================================================================
FROM dependencies AS pruner
WORKDIR /app
RUN pnpm prune --prod

# ==============================================================================
# Stage 5: Minimal Production Runtime
# ==============================================================================
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    NODE_PATH=/app/node_modules:/app/dist/packages:/app/dist/modules

USER node

COPY --chown=node:node --from=pruner /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --chown=node:node --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --chown=node:node --from=builder /app/dist/apps/api ./dist/apps/api
COPY --chown=node:node --from=builder /app/dist/packages ./dist/packages
COPY --chown=node:node --from=builder /app/dist/modules ./dist/modules

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/v1/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/apps/api/src/main.js"]
```

---

### 3.2 Frontend Web Container Architecture (`Dockerfile.web`)

```dockerfile
# ==============================================================================
# Stage 1: Frontend Web Application Builder
# ==============================================================================
FROM node:24.12.0-bookworm-slim AS web-builder
WORKDIR /app

RUN corepack enable pnpm && corepack prepare pnpm@11.17.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY modules/client/package.json ./modules/client/
COPY packages/core/package.json ./packages/core/

RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json nx.json ./
COPY apps/web ./apps/web
COPY packages ./packages

# Public browser environment variables baked into static bundle
ENV MODE=production \
    VITE_API_BASE_URL=/api/v1 \
    VITE_APP_TITLE="Kinergy Platform" \
    VITE_ENABLE_MSW=false \
    VITE_ENABLE_TELEMETRY=true

RUN pnpm nx build web --configuration=production

# ==============================================================================
# Stage 2: Unprivileged Nginx Static Web Server
# ==============================================================================
FROM nginxinc/nginx-unprivileged:1.27-alpine-slim AS web-runner

USER nginx

COPY infrastructure/deployment/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-builder /app/dist/apps/web /usr/share/nginx/html

# Security hygiene: Remove mock service worker script if copied into output
RUN rm -f /usr/share/nginx/html/mockServiceWorker.js

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
```

---

## 4. Workspace Dependency & Packaging Strategy

### 4.1 The Internal Library Resolution Challenge

The API backend imports from two internal monorepo packages:

- `@kinergy-platform/core` (Domain models, money policy, value objects)
- `@kinergy-platform/client-domain` (Client aggregate, timeline)

In development, TypeScript path mappings (`tsconfig.base.json`) resolve these imports directly from source files. However, `@nx/js:tsc` compiles TypeScript to CommonJS without rewriting import specifiers:

```javascript
// Compiled output in dist/apps/api/src/platform/platform.module.js:
const client_domain_1 = require('@kinergy-platform/client-domain');
```

### 4.2 Production Resolution Strategy

To enable standard Node.js module resolution in the production container without requiring runtime bundlers or complex wrappers:

1. **Compile Dependencies During Build**: The builder stage compiles all internal libraries alongside the API (`pnpm nx run-many -t build -p api core client-domain`).
2. **Copy Compiled Libraries to Runtime**: The runner stage copies `/app/dist/packages` and `/app/dist/modules` into the runtime container.
3. **Environment Node Resolution (`NODE_PATH`)**: Setting `NODE_PATH=/app/node_modules:/app/dist/packages:/app/dist/modules` allows Node's CJS module resolver to find `@kinergy-platform/*` libraries natively and deterministically.

---

## 5. Prisma Generation and Database Migration Strategy

### 5.1 Prisma Query Engine in Containers

- The Prisma CLI generates native C++ query engine binaries (`libquery_engine-*.so.node`) tailored to the host operating system.
- Executing `pnpm prisma generate` inside the Debian Bookworm build container guarantees the engine binary matches the Linux container architecture (`linux-glibc-openssl-3.0.x`).
- The generated client in `/app/node_modules/.prisma` and `/app/node_modules/@prisma` is copied into the final runner image.

### 5.2 Decoupled Migration Strategy (Strict Operational Rule)

- **NEVER** run `prisma migrate deploy` or `prisma migrate dev` inside the API container entrypoint or command.
- In multi-container horizontal scale-outs, concurrent migration attempts cause schema lock collisions, corrupted migration tracking tables, and fatal boot loops.
- **Authoritative Flow**:
  1. The CI/CD pipeline runs a single, dedicated **Migration Task / Container**:
     ```bash
     pnpm prisma migrate deploy
     ```
  2. The migration job runs to completion against the target database.
  3. If the migration fails, the deployment aborts immediately, leaving existing production containers operational.
  4. Only after successful migration completion are new API containers started.

---

## 6. Runtime Configuration Contract

All runtime configuration is supplied exclusively via environment variables.

### 6.1 Backend API Required Variables (`apps/api`)

| Variable Name        | Type    | Example Production Value                                   | Description                                                   |
| :------------------- | :------ | :--------------------------------------------------------- | :------------------------------------------------------------ |
| `NODE_ENV`           | String  | `production`                                               | Enables production optimizations, strict secret checks.       |
| `PORT`               | Number  | `3000`                                                     | HTTP listening port.                                          |
| `DATABASE_URL`       | String  | `postgresql://usr:pass@pg-prod:5432/kinergy?schema=public` | Production PostgreSQL connection string.                      |
| `JWT_ACCESS_SECRET`  | String  | `[Min 32 random high-entropy characters]`                  | Signs short-lived access tokens.                              |
| `JWT_REFRESH_SECRET` | String  | `[Min 32 random high-entropy characters]`                  | Signs refresh tokens.                                         |
| `CORS_ORIGINS`       | String  | `https://app.kinergy.com`                                  | Whitelist of allowed origins (comma-separated, no wildcards). |
| `SWAGGER_ENABLED`    | Boolean | `false`                                                    | Completely disables Swagger documentation UI in production.   |

### 6.2 Frontend Web Invariant Public Variables (`apps/web`)

| Variable Name       | Invariant Value    | Purpose                                                                        |
| :------------------ | :----------------- | :----------------------------------------------------------------------------- |
| `VITE_API_BASE_URL` | `/api/v1`          | **Portability Contract:** Root-relative path. Eliminates environment rebuilds. |
| `VITE_APP_TITLE`    | `Kinergy Platform` | Browser window title.                                                          |
| `VITE_ENABLE_MSW`   | `false`            | Completely disables Mock Service Worker in production.                         |

---

## 7. Secret Handling Rules

1. **Zero Secrets in Docker Images**:
   - Never use `ARG` or `ENV` for sensitive keys (`DATABASE_URL`, `JWT_*`).
   - Image inspection via `docker inspect` or `docker history` exposes all build args.
2. **Context Isolation**:
   - The `.dockerignore` file blocks all `.env*` files from being copied into any layer.
3. **Runtime Injection**:
   - In production, secrets are injected via container platform secret stores (e.g. AWS Secrets Manager, GitHub Deployment Secrets, Kubernetes Secrets, or Railway Environment Variables).
4. **Log Sanitization**:
   - `GlobalExceptionFilter` automatically masks credit cards, bearer tokens, JWTs, and database URLs in application logs.

---

## 8. Runtime User & Least Privilege Security

| Container     | System User | UID  | GID  | Shell Access                               | Root Access    |
| :------------ | :---------- | :--- | :--- | :----------------------------------------- | :------------- |
| `kinergy-api` | `node`      | 1000 | 1000 | Disabled (`/sbin/nologin` or `/bin/false`) | **PROHIBITED** |
| `kinergy-web` | `nginx`     | 101  | 101  | Disabled (`/sbin/nologin`)                 | **PROHIBITED** |

### Filesystem Permissions:

- Application files are owned by their respective unprivileged user (`node:node` or `nginx:nginx`).
- Images run with read-only root filesystems where supported (`read_only: true`), with writable `/tmp` and `/var/run` mounted as memory-backed `tmpfs`.

---

## 9. Web Ingress & Reverse Proxy Architecture

The production Nginx configuration (`nginx.conf`) handles SPA routing, security headers, and API proxying:

```nginx
server {
    listen 8080;
    server_name localhost;

    root /usr/share/nginx/html;
    index index.html;

    # Gzip Compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied expired no-cache no-store private auth;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/json application/xml application/javascript;

    # Security Headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

    # Health Check Endpoint
    location /healthz {
        access_log off;
        default_type text/plain;
        return 200 "healthy\n";
    }

    # API Gateway Reverse Proxy
    location /api/v1/ {
        proxy_pass http://api:3000/api/v1/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 5s;
        proxy_read_timeout 60s;
    }

    # Hashed Static Assets (Immutable Caching)
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # SPA History Fallback (No-Cache for Entrypoint)
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
}
```

---

## 10. Image Tagging & Versioning Policy

Container images are tagged deterministically in CI/CD:

```text
ghcr.io/izzydin/kinergy-api:<git-sha>
ghcr.io/izzydin/kinergy-api:<semver>        (e.g. 1.0.0 on git release tag)
ghcr.io/izzydin/kinergy-api:staging         (latest successful build on main)
ghcr.io/izzydin/kinergy-api:latest          (latest production release)

ghcr.io/izzydin/kinergy-web:<git-sha>
ghcr.io/izzydin/kinergy-web:<semver>
ghcr.io/izzydin/kinergy-web:staging
ghcr.io/izzydin/kinergy-web:latest
```

---

## 11. Security Verification Requirements

Before an image is approved for deployment, the CI pipeline must enforce:

1. **Vulnerability Scanning**: Trivy or Docker Scout scans image layers for CVEs. Zero `CRITICAL` or `HIGH` unfixed OS vulnerabilities permitted.
2. **Secret Auditing**: Verify that no files matching `.env*`, `*.pem`, `*.key`, or `*.log` exist in the final filesystem layers.
3. **Non-Root Verification**: Verify image metadata specifies non-root `USER` directive.

---

## 12. Reproducible Build Commands

Executed from the monorepo workspace root:

```bash
# 1. Build API Container Image
docker build \
  -f infrastructure/deployment/docker/Dockerfile.api \
  -t kinergy-api:local \
  .

# 2. Build Web Container Image
docker build \
  -f infrastructure/deployment/docker/Dockerfile.web \
  -t kinergy-web:local \
  .
```

---

## 13. Local Production Container Acceptance Checklist

A local deployment test using `docker-compose.production.yml` verifies readiness:

- [ ] **TC-01 (API Build):** `Dockerfile.api` compiles cleanly from monorepo root without cache errors.
- [ ] **TC-02 (Web Build):** `Dockerfile.web` compiles cleanly and builds Vite bundle.
- [ ] **TC-03 (API Non-Root):** `docker exec kinergy-api whoami` returns `node`.
- [ ] **TC-04 (Web Non-Root):** `docker exec kinergy-web whoami` returns `nginx`.
- [ ] **TC-05 (API Health):** `curl -f http://localhost:3000/api/v1/health` returns `200 OK` with JSON status.
- [ ] **TC-06 (Web Health):** `curl -f http://localhost:8080/healthz` returns `healthy`.
- [ ] **TC-07 (SPA Fallback):** `curl -I http://localhost:8080/gym/memberships` returns `200 OK` (serving `index.html`).
- [ ] **TC-08 (API Reverse Proxy):** `curl -f http://localhost:8080/api/v1/health` routes through Nginx and returns `200 OK`.
- [ ] **TC-09 (Database Connectivity):** API performs authentication and reads from PostgreSQL container.
- [ ] **TC-10 (Graceful Termination):** `docker stop kinergy-api` sends `SIGTERM`, logs shutdown hooks, and terminates within 5 seconds without `SIGKILL`.
