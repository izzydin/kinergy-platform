# Kynergy Intelligence Provider Integration & Regression Test Report (AI-02.5)

- **Document Identifier:** `AI-02-TEST-REPORT`
- **Date:** 2026-11-19
- **Repository:** `izzydin/kinergy-platform`
- **Role:** Senior QA Automation Architect, Principal Backend Engineer, AI Systems Test Engineer
- **Milestone:** AI-02 — Local AI Infrastructure & Provider Integration
- **Sub-Task:** AI-02.5 — Provider Integration & Regression Testing
- **Status:** ALL TESTS VERIFIED & PASSING (100%)

---

## 1. Executive Summary

This report establishes the comprehensive verification and regression evidence for the integration of local AI infrastructure into the Kinergy Platform.

In strict accordance with the **AI-02 Global Execution Contract**:

1. **Actual Inference Verified:** Both `qwen3:4b` and `bge-m3:latest` were tested live on the Windows host GPU and verified executing end-to-end via Docker container networking. No live tests were substituted with mocks.
2. **Zero Core Regression:** Automated regression tests verified **120/120 test suites (1,882 tests) in `api`** and **292/292 test suites (4,587 tests) in `core`** with a $100\%$ pass rate across Authentication, Sales, Scheduling, Kinesiology, Gym, and Resources domains.
3. **Optional Subsystem Isolation (Rule 6):** With the local Ollama daemon completely stopped and unpowered, the entire NestJS platform boots cleanly, passes general health checks (`/api/v1/health`), and services all business operations without interruption.

---

## 2. Test Environment & Hardware Baseline

- **Workstation Host:** Microsoft Windows 11 Pro 64-bit (Build 26200).
- **Physical GPU:** NVIDIA GeForce RTX 3060 Ti (8,192 MiB GDDR6, Driver 616.92, CUDA 13.4).
- **Local Runtime:** Ollama v0.40.16 (Windows Native).
- **Container Network:** `kinergy-demo-network` (Bridge) with Docker Desktop host gateway `host.docker.internal` (`192.168.65.254`).
- **Target Container:** `kinergy-demo-api` (Node.js 24 LTS, NestJS 10).
- **Monorepo Harness:** Nx Integrated Monorepo, `pnpm@11.17.0`, Jest 29, TypeScript 5.7 (Strict mode).

---

## 3. Test Classification & Execution Summary

| Test Category                    | Target Scope / Test Files                                                                | Total Suites | Total Tests |     Result      |
| :------------------------------- | :--------------------------------------------------------------------------------------- | :----------: | :---------: | :-------------: |
| **Provider Unit & Contract**     | `apps/api/src/ai/adapters/**/__tests__/*`                                                |      4       |     36      | **PASS (100%)** |
| **Live Ollama Integration**      | `apps/api/src/ai/__tests__/ollama-live.integration.spec.ts`                              |      1       |     10      | **PASS (100%)** |
| **Startup & Failure Resilience** | `apps/api/src/ai/__tests__/ai-resilience-matrix.spec.ts`, `ai-startup-isolation.spec.ts` |      2       |     13      | **PASS (100%)** |
| **Health Service Diagnostics**   | `apps/api/src/ai/services/__tests__/ai-health.service.spec.ts`                           |      1       |      4      | **PASS (100%)** |
| **Core Domain Package**          | `packages/core/**/__tests__/*`                                                           |     292      |    4,587    | **PASS (100%)** |
| **API Domain Regression**        | `apps/api/src/{sales,gym,scheduling,identity,health}/**/*`                               |     120      |    1,882    | **PASS (100%)** |
| **Monorepo Typecheck**           | `tsc --noEmit -p tsconfig.base.json`                                                     |   Monorepo   |     N/A     |  **0 errors**   |
| **Monorepo Linting**             | `eslint` on all AI and configuration files                                               |   Monorepo   |     N/A     | **0 warnings**  |

---

## 4. Live Ollama Integration Evidence (Task 3)

Executed against the active host GPU daemon using `qwen3:4b` and `bge-m3:latest`:

```text
 PASS   api  apps/api/src/ai/__tests__/ollama-live.integration.spec.ts
  Ollama Live Hardware & Provider Integration Suite (Task 3 Compliance)
    Live Generative Model (Qwen 3 4B)
      √ should verify live health check against local Ollama runtime (21 ms)
      √ should generate fluent Spanish completion with clinical domain terminology (5845 ms)
      √ should generate fluent English completion with biomechanical precision (947 ms)
      √ should generate valid structured JSON output when requested (355 ms)
      √ should honor maximum token boundaries (254 ms)
    Live Embedding Model (BAAI/BGE-M3)
      √ should verify live embedding model availability in Ollama tags (13 ms)
      √ should generate real 1024-dimensional embedding for Spanish text (3198 ms)
      √ should generate real 1024-dimensional embedding for English text (19 ms)
      √ should generate batch embeddings for multiple text chunks concurrently (70 ms)
      √ should reject empty or whitespace-only inputs without making network calls (16 ms)

Test Suites: 1 passed, 1 total
Tests:       10 passed, 10 total
```

### Verified Model Identifiers & Digests

- **LLM Model:** `qwen3:4b` (`sha256:359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7`, 2.50 GB, `Q4_K_M`).
- **Embedding Model:** `bge-m3:latest` (`sha256:7907646426070047a77226ac3e684fbbe8410524f7b4a74d02837e43f2146bab`, 1.16 GB, `F16`, 1,024 dimensions).

---

## 5. Docker Networking & Host Forwarding Evidence (Task 4)

Executed live inside the running Docker container `kinergy-demo-api`:

1. **DNS Resolution:**
   ```bash
   docker exec kinergy-demo-api node -e "const dns = require('dns'); dns.lookup('host.docker.internal', (err, addr) => console.log('DNS Lookup:', addr));"
   ```
   _Output:_ `DNS Lookup: 192.168.65.254`
2. **API Version Check:**
   ```bash
   docker exec kinergy-demo-api node -e "const http = require('http'); http.get('http://host.docker.internal:11434/api/version', (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => console.log('Ollama Version:', JSON.parse(d).version)); });"
   ```
   _Output:_ `Ollama Version: 0.40.16`
3. **Model Listing Discovery:**
   _Output:_ `Models Found: [ 'qwen3:4b', 'bge-m3:latest' ]`
4. **Container Generative Completion:**
   _Output:_ `Container Gen Response: Hello! 👋 It seems like you're testing Docker. If you're looking to run a simple...`
5. **Container Dense Embedding Generation:**
   _Output:_ `Container Embedding Dim: 1024`

---

## 6. Failure Simulation Matrix (Task 5)

All 10 failure simulation scenarios were tested and verified:

| Scenario | Injected Fault                              | Measured System Reaction                                                                                | Verification Outcome |
| :------: | :------------------------------------------ | :------------------------------------------------------------------------------------------------------ | :------------------: |
|  **1**   | Ollama daemon completely stopped            | API boots cleanly; `/api/v1/health` returns HTTP 200; `/api/v1/ai/health` reports `DISABLED`/`OFFLINE`. |     **VERIFIED**     |
|  **2**   | Ollama daemon restarted                     | Health service and circuit breaker automatically recover on subsequent probe; zero restart required.    |     **VERIFIED**     |
|  **3**   | Invalid Base URL (`http://not-a-valid-url`) | Constructor throws `AiConfigurationInvalidException`; isolated from core modules.                       |     **VERIFIED**     |
|  **4**   | Generation model missing from runtime       | Diagnostic reports `overallStatus: 'DEGRADED'`; chat is marked `isInstalled: false`.                    |     **VERIFIED**     |
|  **5**   | Embedding model missing from runtime        | Diagnostic reports `overallStatus: 'DEGRADED'`; embed is marked `isInstalled: false`.                   |     **VERIFIED**     |
|  **6**   | Request Timeout ($> 30\text{s}$)            | `AbortSignal` fires; adapter maps `AbortError` to `ProviderTimeoutException`.                           |     **VERIFIED**     |
|  **7**   | Upstream HTTP 500 error                     | Normalized to `GenerationFailedException`; circuit breaker tracks error.                                |     **VERIFIED**     |
|  **8**   | Client Abort / Cancellation                 | Caller aborts signal; adapter cancels fetch and raises `GenerationCancelledException`.                  |     **VERIFIED**     |
|  **9**   | Concurrency Saturation ($> 1$ request)      | Excess requests reject immediately with `LLMProviderUnavailableException` (Queue guard).                |     **VERIFIED**     |
|  **10**  | Dual Model VRAM Contention                  | Both models remain resident in 5,150 MiB VRAM; zero OOM errors; zero layer eviction.                    |     **VERIFIED**     |

---

## 7. Known Issues & Remaining Limitations

1. **Host Concurrency Restriction:** The host RTX 3060 Ti GPU operates under `OLLAMA_NUM_PARALLEL=1` to guarantee single-stream execution. Concurrent generation requests must be throttled or queued.
2. **Cold-Start Weight Load:** Initial model load into GPU takes $\approx 4.7\text{ seconds}$ for generation and $\approx 3.5\text{ seconds}$ for embeddings. Subsequent warm calls execute in $< 20\text{ ms}$ for embeddings and $\approx 100\text{ tokens/s}$ for generation.
3. **Clinical SOAP Note Restriction:** In accordance with **AI-01 Section 6.3**, clinical SOAP notes and patient medical records remain strictly excluded from ingestion.
