# Reverse Proxy, Ingress, and SPA Routing Specification

**Status:** APPROVED & IMPLEMENTED  
**Version:** 1.0  
**Authors:** Senior Infrastructure Engineer & Application Security Engineer  
**Date:** 2026-11-03

---

## 1. Architectural Overview & Selection Rationale

The Kynergy platform employs a unified **Single-Origin Application Gateway & Reverse Proxy Architecture**. In containerized staging and production deployments, an unprivileged Nginx instance (`kinergy-web`, running under UID 101 on port 8080) serves static assets, provides HTML5 SPA routing fallback, and proxies `/api/*` traffic to the NestJS API (`kinergy-api`, running on port 3000).

```
                 Internet Client / Browser
                            │
                            ▼
          ┌───────────────────────────────────┐
          │   Public Ingress / Cloud ALB      │
          │   (TLS Termination / 443 -> 8080) │
          └─────────────────┬─────────────────┘
                            │  HTTP (X-Forwarded-Proto: https)
                            ▼
          ┌───────────────────────────────────┐
          │       Nginx Reverse Proxy         │
          │    (kinergy-web:8080, UID 101)    │
          └───┬───────────────────────────┬───┘
              │                           │
     /api/*   │                  /*       │
     (Proxy)  │                           │  (Static File / SPA)
              ▼                           ▼
    ┌──────────────────┐        ┌──────────────────┐
    │   NestJS API     │        │  Vite SPA Assets │
    │ (port 3000:node) │        │  (/usr/share/    │
    │ /api/v1/*        │        │   nginx/html)    │
    └──────────────────┘        └──────────────────┘
```

### 1.1 Technology Selection Rationale

1. **Elimination of Cross-Origin Overhead (CORS):** By routing both the SPA frontend and the backend API through a unified origin (port 8080 externally, or standard 443 under TLS Ingress), browser cross-origin preflight requests (`OPTIONS`) are eliminated for same-origin browser clients.
2. **Defensive Error Isolation:** API failures (502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout) are intercepted by Nginx and formatted as structured JSON error payloads, preventing SPA `index.html` fallback from swallowing or masking backend failures.
3. **Decoupled Lifecycle & Zero Downtime:** The web container can be redeployed or updated without dropping database connection pools in the backend API container, and vice versa.
4. **Least-Privilege Security Boundary:** Nginx executes completely unprivileged (`nginx` UID 101), binding to port 8080 without root permissions or Linux capabilities (`CAP_NET_BIND_SERVICE`).

---

## 2. Public & Internal Routing Contracts

### 2.1 Public Ingress Routing Matrix

| Route Pattern             | Target Destination                               | Caching Policy                        | Error Handling                                              |
| :------------------------ | :----------------------------------------------- | :------------------------------------ | :---------------------------------------------------------- |
| `location = /healthz`     | Nginx Synthetic Response                         | `access_log off;` (No cache)          | Returns `200 OK` text `healthy\n`                           |
| `location /api`           | Upstream `http://api:3000`                       | Controlled by API endpoints           | Intercepts 502/503/504 $\rightarrow$ returns JSON 502       |
| `location /assets/`       | Static directory `/usr/share/nginx/html/assets/` | `public, max-age=31536000, immutable` | Native 404 if asset missing                                 |
| `location = /favicon.ico` | Static file `/usr/share/nginx/html/favicon.ico`  | `public, max-age=86400`               | Log not found disabled                                      |
| `location = /robots.txt`  | Static file `/usr/share/nginx/html/robots.txt`   | `public, max-age=86400`               | Log not found disabled                                      |
| `location /`              | Static SPA Fallback (`index.html`)               | `no-cache, no-store, must-revalidate` | HTML5 History fallback (`try_files $uri $uri/ /index.html`) |

### 2.2 Forwarded Headers & Upstream Contract

When proxying to `http://api:3000`, Nginx attaches:

```nginx
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host $host;
proxy_set_header X-Forwarded-Port $server_port;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection $connection_upgrade;
```

- **HTTP Version:** Enforced to `HTTP/1.1` to maintain persistent keepalive connections.
- **WebSocket & SSE Upgrades:** Dynamic connection mapping enables clean protocol upgrades for bidirectional communication.
- **Preservation of Verbs & Payloads:** HTTP methods (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`) and query strings are passed verbatim without rewrite or truncation.

---

## 3. Security, TLS Termination & Header Governance

### 3.1 TLS Termination Architecture

- **Public Boundary Offloading:** TLS is terminated upstream of Nginx at the cloud load balancer (AWS Application Load Balancer with ACM, Google Cloud External HTTPS Load Balancer, Cloudflare Edge, or Kubernetes Ingress Controller with `cert-manager`).
- **TLS Configuration:**
  - Protocols: TLS 1.3 (preferred), TLS 1.2 (minimum).
  - Cipher Suites: Forward-secret AEAD ciphers only (`ECDHE-ECDSA-AES128-GCM-SHA256`, `ECDHE-RSA-AES128-GCM-SHA256`).
  - HSTS: `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` emitted at the public boundary.
- **Zero In-Repo Secrets:** Production certificates and private keys are never checked into Git or embedded within Docker image layers.

### 3.2 Security Headers Enforced by Reverse Proxy

```nginx
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
add_header X-XSS-Protection "0" always;
server_tokens off;
```

### 3.3 Payload & Memory Protection

- `client_max_body_size 10m;` restricts incoming client payloads to 10 MB, preventing memory exhaustion attacks while permitting batch operations (e.g. inventory ledger updates, clinical notes).
- Payloads exceeding 10 MB are rejected immediately at the proxy boundary with `HTTP/1.1 413 Request Entity Too Large` without burdening backend Node.js worker threads.

---

## 4. Operational Behavior & Gateway Resilience

### 4.1 Upstream Failure Isolation

When the API service is restarting, upgrading, or temporarily unreachable, Nginx invokes `@api_gateway_error`:

```json
{
  "statusCode": 502,
  "error": "Bad Gateway",
  "message": "API gateway service temporarily unavailable"
}
```

This prevents the browser's JSON parsers (`response.json()`) from throwing syntax errors caused by HTML 502 pages, and guarantees that API errors are never masked as successful SPA 200 responses.

### 4.2 Timeouts

- `proxy_connect_timeout 5s;`
- `proxy_send_timeout 30s;`
- `proxy_read_timeout 60s;`

---

## 5. Local & CI Verification Workflow

```bash
# 1. Start isolated local production stack
docker compose -f docker-compose.production.yml up -d

# 2. Verify proxy health
curl -I http://127.0.0.1:8080/healthz

# 3. Verify SPA fallback on deep link
curl -I http://127.0.0.1:8080/gym/memberships

# 4. Verify API reverse proxy pass-through
curl http://127.0.0.1:8080/api/v1/health

# 5. Run automated proxy routing tests
pnpm nx test api --testFile=reverse-proxy-routing.spec.ts
```
