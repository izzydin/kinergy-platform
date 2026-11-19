# AI-02.4 — AI Configuration, Health Checks & Failure Isolation Specification

- **Document Identifier:** `AI-02-CONFIGURATION-AND-HEALTH-REPORT`
- **Date:** 2026-11-19
- **Repository:** `izzydin/kinergy-platform`
- **Role:** Principal NestJS Platform Architect, Site Reliability Engineer
- **Milestone:** AI-02 — Local AI Infrastructure & Provider Integration
- **Sub-Task:** AI-02.4 — Configuration, Health Monitoring & Failure Isolation
- **Status:** IMPLEMENTED & TEST VERIFIED

---

## 1. Executive Summary

This document specifies the configuration schema, environment validation, decoupled health check architecture, model readiness states, bounded concurrency, and failure isolation guardrails for **Kynergy Intelligence**.

In accordance with **Rule 6 (AI Must Remain Optional)** and the **AI-02 Global Execution Contract**:

1. **Zero Impact on Existing MVP:** When the AI feature is disabled (`AI_ENABLED=false`) or when the local Ollama runtime is offline/uninstalled, the NestJS application starts cleanly, passes general health checks (`/api/v1/health`), and services core clinic, gym, and commercial operations without degradation.
2. **Independent Health Architecture:** General application liveness/readiness is strictly decoupled from optional AI infrastructure readiness.
3. **Four-Tiered Model Readiness:** AI diagnostics explicitly distinguish between runtime reachability, model installation, VRAM residency, and model response capability.
4. **Resilience & Bounded Concurrency:** Single-stream execution concurrency caps, request timeouts, client cancellation, and circuit breaking prevent resource exhaustion on host hardware.

---

## 2. Environment Variables & Configuration Schema

All AI environment variables are validated via Zod in [`apps/api/src/config/env.validation.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/config/env.validation.ts) and mapped into [`AiConfiguration`](file:///c:/Projects/kinergy-platform/apps/api/src/ai/config/ai.config.ts).

### 2.1 Complete Variable Specification

| Environment Variable                       | Type / Constraints              | Default Value            | Purpose & Architectural Function                                                                 |
| :----------------------------------------- | :------------------------------ | :----------------------- | :----------------------------------------------------------------------------------------------- |
| **`AI_ENABLED`**                           | `boolean` (`true`/`false`)      | `false`                  | Master feature flag. When `false`, zero network calls are attempted; mock adapters are injected. |
| **`AI_LLM_PROVIDER`**                      | `'mock' \| 'ollama'`            | `'mock'`                 | Provider selection for conversational and RAG text generation.                                   |
| **`AI_EMBEDDING_PROVIDER`**                | `'mock' \| 'ollama'`            | `'mock'`                 | Provider selection for dense geometric vector generation.                                        |
| **`AI_OLLAMA_BASE_URL`**                   | Valid HTTP/HTTPS URL            | `http://127.0.0.1:11434` | Base endpoint for the Ollama inference daemon.                                                   |
| **`AI_OLLAMA_REQUEST_TIMEOUT_MS`**         | Positive integer ($\ge 1000$)   | `30000`                  | Hard timeout for generation requests (aligned with cold-load benchmark findings).                |
| **`AI_OLLAMA_HEALTH_TIMEOUT_MS`**          | Positive integer ($\ge 500$)    | `3000`                   | Non-blocking probe timeout for runtime health checks.                                            |
| **`AI_CHAT_MODEL`**                        | `string`                        | `qwen3:4b`               | Approved generative chat model identifier.                                                       |
| **`AI_CHAT_TEMPERATURE`**                  | Float ($0.0 \le t \le 2.0$)     | `0.2`                    | Sampling temperature for factual retrieval synthesis.                                            |
| **`AI_CHAT_MAX_OUTPUT_TOKENS`**            | Positive integer ($\le 32768$)  | `512`                    | Token generation ceiling per completion request.                                                 |
| **`AI_CHAT_CONTEXT_WINDOW`**               | Positive integer ($\le 262144$) | `4096`                   | Context limit capping VRAM KV-cache allocation to $\approx 600\text{ MiB}$.                      |
| **`AI_CHAT_MAX_CONCURRENT_REQUESTS`**      | Positive integer ($\le 16$)     | `1`                      | Concurrency ceiling enforcing single-stream GPU execution on 8GB VRAM.                           |
| **`AI_EMBEDDING_MODEL`**                   | `string`                        | `bge-m3:latest`          | Approved dense embedding model identifier.                                                       |
| **`AI_EMBEDDING_DIMENSIONS`**              | Strictly `1024`                 | `1024`                   | Vector dimensionality validation (strictly 1024 for BGE-M3).                                     |
| **`AI_EMBEDDING_BATCH_SIZE`**              | Positive integer ($\le 128$)    | `16`                     | Maximum chunks batched per embedding pass to avoid VRAM thrashing.                               |
| **`AI_EMBEDDING_MAX_CONCURRENT_REQUESTS`** | Positive integer ($\le 16$)     | `2`                      | Maximum concurrent batch embedding requests.                                                     |
| **`AI_HEALTH_CHECK_ENABLED`**              | `boolean`                       | `true`                   | Enables the `/api/v1/ai/health` probe endpoint.                                                  |
| **`AI_PROVIDER_STARTUP_CHECK`**            | `boolean`                       | `false`                  | When `true`, logs a non-blocking diagnostic message upon application bootstrap.                  |
| **`AI_PROVIDER_FAILURE_THRESHOLD`**        | Positive integer                | `3`                      | Consecutive failures before circuit breaker trips open.                                          |

---

## 3. Decoupled Health-Check Architecture

```mermaid
flowchart TD
    subgraph Clients["Monitoring & Client Agents"]
        LoadBalancer["Load Balancer / K8s / Terminus"]
        StaffClient["Frontend / Admin UI"]
    end

    subgraph CoreApp["Kinergy Core Application (Port 3000)"]
        GeneralHealthCtrl["AppController\nGET /api/v1/health"]
        GeneralHealthService["Core App Readiness\n(Prisma DB, Memory, Uptime)"]

        GeneralHealthCtrl --> GeneralHealthService
    end

    subgraph AiSubsystem["Kynergy Intelligence Bounded Context"]
        AiHealthCtrl["AiHealthController\nGET /api/v1/ai/health"]
        AiHealthService["AiHealthService"]

        AiHealthCtrl --> AiHealthService
    end

    subgraph HostOllama["Local Inference Daemon (Port 11434)"]
        OllamaTags["GET /api/tags\n(Checks Installed Models)"]
        OllamaPs["GET /api/ps\n(Checks VRAM Resident Models)"]
    end

    LoadBalancer ==>|Liveness & Readiness| GeneralHealthCtrl
    StaffClient -->|AI Subsystem Diagnostics| AiHealthCtrl

    AiHealthService -.->|Non-invasive Probe (3s timeout)| OllamaTags
    AiHealthService -.->|Non-invasive Probe (3s timeout)| OllamaPs

    classDef core fill:#dcfce7,stroke:#16a34a,stroke-width:2px;
    classDef ai fill:#ede9fe,stroke:#7c3aed,stroke-width:2px;
    classDef ext fill:#fef3c7,stroke:#d97706,stroke-width:2px;

    class GeneralHealthCtrl,GeneralHealthService core;
    class AiHealthCtrl,AiHealthService ai;
    class OllamaTags,OllamaPs ext;
```

### 3.1 Four-Tiered Model Readiness Classification

To prevent false assumptions during diagnostics, `AiHealthService` classifies model readiness across four explicit levels:

1. **Runtime Reachable (`runtimeReachable: boolean`):**
   Determined by a successful, non-invasive ping to `GET /api/tags` within `healthTimeoutMs` (3s).
2. **Model Installed (`isInstalled: boolean`):**
   Confirmed if the exact model tag (`qwen3:4b` or `bge-m3:latest`) exists in Ollama's local manifest repository.
3. **Model Loaded in VRAM (`isLoaded: boolean`):**
   Confirmed by non-invasively inspecting `GET /api/ps`. If active in VRAM, `isLoaded` is `true`. Ordinary health probes **never** execute generation to force model loading.
4. **Model Capable of Responding (`isCapable: boolean`):**
   Evaluated as `runtimeReachable && isInstalled`.

### 3.2 AI Subsystem Health States

| Overall Status    | Condition                                                         | API Response Behavior                                                                            |
| :---------------- | :---------------------------------------------------------------- | :----------------------------------------------------------------------------------------------- |
| **`DISABLED`**    | `AI_ENABLED=false`                                                | Returns HTTP 200 with `{ enabled: false, overallStatus: 'DISABLED' }`. Zero network calls.       |
| **`OPERATIONAL`** | Runtime reachable and both chat and embedding models installed.   | Returns HTTP 200 with model readiness and latencies.                                             |
| **`DEGRADED`**    | Runtime reachable, but either chat OR embedding model is missing. | Returns HTTP 200 with specific degraded model identified.                                        |
| **`OFFLINE`**     | Runtime unreachable, socket timeout, or connection refused.       | Returns HTTP 200 with `{ overallStatus: 'OFFLINE', runtimeReachable: false }`. Never throws 500. |

---

## 4. Failure Isolation & Bounded Concurrency

### 4.1 Bounded Concurrency Guard

Based on AI-02.2 benchmark findings on 8GB VRAM cards:

- Single-stream GPU execution sustains $\approx 100\text{ tokens/s}$.
- Running concurrent generation requests risks KV-cache thrashing and exceeding physical VRAM headroom.
- In `OllamaLLMAdapter`:
  ```typescript
  if (this.activeGenerations >= this.config.chatMaxConcurrent) {
    throw new LLMProviderUnavailableException(
      'AI generation capacity saturated. Maximum concurrent requests reached.',
    );
  }
  ```

### 4.2 Circuit Breaker Specification

- **Failure Threshold:** 3 consecutive errors (timeouts, network drops, HTTP 500s).
- **Tripped State Action:** Fast-fails immediately within $< 2\text{ ms}$ with `LLMProviderUnavailableException`, preventing Node.js event-loop exhaustion.
- **Cooldown Period:** 15 seconds. After 15s, transitions to half-open, allowing a single test probe to verify provider recovery.

---

## 5. Verification: 10 Resilience Scenarios Matrix

Implemented in [`apps/api/src/ai/__tests__/ai-resilience-matrix.spec.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/ai/__tests__/ai-resilience-matrix.spec.ts):

| Scenario # | Test Description                      | Expected Behavior                                                            | Automated Test Result |
| :--------: | :------------------------------------ | :--------------------------------------------------------------------------- | :-------------------: |
|   **1**    | AI disabled and Ollama unavailable    | Reports `DISABLED`; 0 network calls; zero startup blocking.                  |      **PASSED**       |
|   **2**    | AI enabled and Ollama available       | Reports `OPERATIONAL`, `isInstalled: true`, `isLoaded: true`.                |      **PASSED**       |
|   **3**    | AI enabled and Ollama unavailable     | Reports `OFFLINE` gracefully without throwing uncaught exceptions.           |      **PASSED**       |
|   **4**    | Generation model missing              | Reports `DEGRADED`; chat `isInstalled: false`; embed `isInstalled: true`.    |      **PASSED**       |
|   **5**    | Embedding model missing               | Reports `DEGRADED`; chat `isInstalled: true`; embed `isInstalled: false`.    |      **PASSED**       |
|   **6**    | Provider timeout                      | Adapter maps `AbortError` to pure `ProviderTimeoutException`.                |      **PASSED**       |
|   **7**    | Provider recovery                     | Circuit breaker trips after 3 failures, waits 15s, recovers on next success. |      **PASSED**       |
|   **8**    | Health endpoint failure isolation     | General `/api/v1/health` remains `status: 'ok'` even when AI is dead.        |      **PASSED**       |
|   **9**    | Invalid AI configuration              | Throws `AiConfigurationInvalidException` without crashing core modules.      |      **PASSED**       |
|   **10**   | Existing app startup with AI disabled | Monorepo boots with full core capabilities and zero Ollama dependency.       |      **PASSED**       |
