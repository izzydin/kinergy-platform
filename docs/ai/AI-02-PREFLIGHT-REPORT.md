# AI-02.0 — Architecture & Environment Preflight Report

- **Document Identifier:** `AI-02.0-PREFLIGHT-REPORT`
- **Date:** 2026-11-19
- **Repository:** `izzydin/kinergy-platform`
- **Role:** Principal AI Infrastructure Architect, Senior Backend Architect
- **Milestone:** AI-02 — Local AI Infrastructure & Provider Integration
- **Sub-Task:** AI-02.0 — Architecture & Environment Preflight Baseline
- **Execution Mode:** Strictly Read-Only / Verification-Only (Zero installation, zero download, zero application source modification)

---

## 1. Executive Summary

This preflight evaluation establishes the empirical architecture and infrastructure baseline for **Milestone AI-02 (Local AI Infrastructure & Provider Integration)**. In accordance with the AI-02 Global Execution Contract, all hardware specifications, Docker container networking topology, AI-01 architectural deliverables, approved provider contracts, and model feasibility constraints have been inspected using strictly read-only diagnostics prior to any software installation, model downloading, or code modification.

---

## 2. AI-01 Architecture & Approval Status

### 2.1 Governance & Document Audit

| Deliverable               | Path                                                                | Status             | Verification Findings                                                                        |
| :------------------------ | :------------------------------------------------------------------ | :----------------- | :------------------------------------------------------------------------------------------- |
| **Readiness Audit**       | `docs/audits/AI-00-READINESS-AUDIT.md`                              | `CONDITIONAL PASS` | Core platform reusable; vector infrastructure absent in PostgreSQL 16 Alpine.                |
| **Architecture Baseline** | `docs/ai/AI-01-ARCHITECTURE-BASELINE.md`                            | `PROPOSED`         | Hexagonal boundaries and pure core domain contracts specified.                               |
| **Master Architecture**   | `docs/ai/AI-01-ARCHITECTURE.md`                                     | `PROPOSED`         | Comprehensive C4 diagrams, sequence flows, multi-tenant SQL filtering, and port definitions. |
| **Domain Model**          | `docs/ai/AI-01-DOMAIN-MODEL.md`                                     | `PROPOSED`         | Entity and value object specifications (`VectorEmbedding`, `VisibilityScope`, etc.).         |
| **ADR-AI-001**            | `docs/ai/AI-01-ADRS/ADR-AI-001-ai-bounded-context.md`               | `PROPOSED`         | Independent AI Bounded Context (`Kynergy Intelligence`).                                     |
| **ADR-AI-002**            | `docs/ai/AI-01-ADRS/ADR-AI-002-local-inference-ollama.md`           | `PROPOSED`         | Ollama as local runtime; Qwen 4B generation model.                                           |
| **ADR-AI-003**            | `docs/ai/AI-01-ADRS/ADR-AI-003-postgresql-pgvector.md`              | `PROPOSED`         | PostgreSQL 16 + pgvector for vector persistence.                                             |
| **ADR-AI-004**            | `docs/ai/AI-01-ADRS/ADR-AI-004-embedding-and-model-abstraction.md`  | `PROPOSED`         | Independent ports; BGE-M3 1,024-dim dense embeddings.                                        |
| **ADR-AI-005**            | `docs/ai/AI-01-ADRS/ADR-AI-005-document-processing-architecture.md` | `PROPOSED`         | Chunking, token limits, and async ingestion pipeline.                                        |
| **ADR-AI-006**            | `docs/ai/AI-01-ADRS/ADR-AI-006-rag-security-and-access-control.md`  | `PROPOSED`         | Pre-retrieval SQL tenancy filtering; strict clinical PHI exclusion.                          |
| **ADR-AI-007**            | `docs/ai/AI-01-ADRS/ADR-AI-007-evaluation-and-observability.md`     | `PROPOSED`         | Token, latency, and hallucination tracking with zero PII logging.                            |

### 2.2 Approval Status Analysis

All architectural documents and ADRs are currently in **`PROPOSED`** status. Under the AI-02 Global Execution Contract:

- The provider interfaces (`ILLMProviderPort`, `IEmbeddingProviderPort`) are fully specified with zero ambiguity.
- The separation of concerns between core domain purity and adapter infrastructure is formally locked.
- **Verdict:** Approved to proceed with AI-02 provider adapter baseline implementation, provided no unapproved ADR modifications are introduced.

---

## 3. Approved Provider Contracts

Derived verbatim from `docs/ai/AI-01-ARCHITECTURE.md` (Lines 455–480):

### 3.1 LLM Generation Port (`ILLMProviderPort`)

```typescript
export interface LLMGenerationOptions {
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  signal?: AbortSignal;
}

export interface LLMGenerationResult {
  text: string;
  promptTokens: number;
  completionTokens: number;
  modelIdentifier: string;
  finishReason: 'stop' | 'length' | 'cancelled';
}

export interface ILLMProviderPort {
  generateText(prompt: string, options?: LLMGenerationOptions): Promise<LLMGenerationResult>;
  generateStream(prompt: string, options?: LLMGenerationOptions): AsyncIterable<string>;
  getModelIdentifier(): string;
  checkHealth(): Promise<{ isHealthy: boolean; model: string; latencyMs: number }>;
}
```

### 3.2 Embedding Port (`IEmbeddingProviderPort`)

```typescript
export interface IEmbeddingProviderPort {
  generateEmbedding(text: string): Promise<number[]>;
  generateBatchEmbeddings(texts: string[]): Promise<number[][]>;
  getDimensions(): number; // Strictly returns 1024 for BGE-M3
  getModelIdentifier(): string;
}
```

---

## 4. Repository Integration Locations

To maintain Clean Hexagonal Architecture, the code is partitioned strictly across domain ports in `@kinergy/core` and concrete infrastructure adapters in `apps/api`:

```
packages/core/src/ai/
├── domain/
│   └── exceptions/
│       └── ai-provider.exceptions.ts        # Pure domain exceptions (AIProviderException, etc.)
└── ports/
    └── outbound/
        ├── llm-provider.port.ts             # Pure ILLMProviderPort interface
        └── embedding-provider.port.ts       # Pure IEmbeddingProviderPort interface

apps/api/src/ai/
├── adapters/
│   ├── llm/
│   │   └── ollama-llm.adapter.ts            # Implements ILLMProviderPort via Ollama HTTP
│   ├── embedding/
│   │   └── ollama-embedding.adapter.ts      # Implements IEmbeddingProviderPort via Ollama HTTP
│   └── mocks/
│       ├── mock-llm.adapter.ts              # Fallback / test mock LLM
│       └── mock-embedding.adapter.ts        # Fallback / test mock embedder (1,024-dim zeros)
├── config/
│   └── ai.config.ts                         # AI environment configuration schema
├── controllers/
│   └── ai-health.controller.ts              # Decoupled /api/v1/ai/health endpoint
├── services/
│   └── ai-health.service.ts                 # Health diagnostic aggregation
├── ai.tokens.ts                             # NestJS dependency injection tokens
└── ai.module.ts                             # Dynamic AiModule.forRoot() provider wiring
```

---

## 5. Host Hardware & Environment Inventory

Inspected via read-only diagnostics (`Get-CimInstance`, `nvidia-smi`, `Get-PSDrive`):

| Component                  | Specification / Metric                                           | Status                       |
| :------------------------- | :--------------------------------------------------------------- | :--------------------------- |
| **Operating System**       | Microsoft Windows 11 Pro 64-bit (Build 26200)                    | Verified                     |
| **Host System RAM**        | 16,633,720 KB (~15.86 GB) Total / ~2.48 GB Free                  | Verified                     |
| **Storage (C:)**           | 326.96 GB Free / 603.53 GB Used (NTFS)                           | Verified (> 300 GB headroom) |
| **GPU Model**              | NVIDIA GeForce RTX 3060 Ti (Ampere architecture, Compute 8.6)    | Verified                     |
| **GPU Driver**             | NVIDIA 616.92 / CUDA UMD 13.4                                    | Verified                     |
| **Physical VRAM**          | 8,192 MiB (~8.0 GB GDDR6)                                        | Verified                     |
| **Baseline OS VRAM Usage** | ~1,390 MiB (~1.36 GB used by desktop GUI & background processes) | Verified                     |
| **VRAM Available for AI**  | ~6,802 MiB (~6.64 GB available for model compute)                | Verified                     |

---

## 6. Existing Ollama State

Inspected via file manifests and process diagnostics:

- **Ollama CLI Binary:** Located at `C:\Users\MI EQUIPO\AppData\Local\Programs\Ollama\ollama.exe` (Version 0.40.16).
- **Process State:** Stopped / Available on demand (Port 11434 unbound at preflight).
- **Downloaded Models on Host:**
  - `qwen3:4b` (`sha256:359d7dd4bcda...`, 2,497,293,931 bytes / 2.50 GB, `Q4_K_M` quantization).
  - `bge-m3:latest` (`sha256:790764642607...`, 1,157,672,605 bytes / 1.16 GB, `F16` quantization, 1,024 dims).
- **Redownload Required:** **NO**. Both approved models are already fully resident in `C:\Users\MI EQUIPO\.ollama\models`.

---

## 7. Docker Networking & Host Connectivity Assessment

Inspected via `docker ps`, `docker-compose.demo.yml`, and `docker exec` DNS lookups:

1. **Active Containers:**
   - `kinergy-demo-api` (Port 3000 -> 3000)
   - `kinergy-demo-web` (Port 8080 -> 8080)
   - `kinergy-demo-postgres` (Port 5433 -> 5432)
   - `kinergy-postgres` (Port 5432)
   - `kinergy-staging-postgres` (Port 5434 -> 5432)
2. **Container Network:** `kinergy-demo-network` (Docker bridge driver).
3. **Gateway Resolution:**
   - Inside `kinergy-demo-api`, `host.docker.internal` resolves to `192.168.65.254` (IPv4) and `fdc4:f303:9324::254` (IPv6).
4. **Safest Host-to-Container Connection Strategy:**
   - Ollama runs natively on the Windows host bound to loopback `127.0.0.1:11434`.
   - Docker Desktop for Windows automatically proxies `host.docker.internal:11434` into the host's loopback interface.
   - **Security Safeguard:** Zero Windows Firewall rules opening port 11434 to external physical networks (`0.0.0.0`) are required.
   - For local development outside Docker (e.g. `pnpm test`), `http://127.0.0.1:11434` is used directly. For the Docker container, `http://host.docker.internal:11434` is supplied via `OLLAMA_BASE_URL`.

---

## 8. Model Feasibility & VRAM Budget Analysis

### 8.1 Physical Memory Allocation (8,192 MiB VRAM Total)

$$ \begin{aligned}
\text{Host Desktop / Display Overhead} &: \approx 1,390\text{ MiB} \\
\text{Qwen 3 4B (Q4\_K\_M, 4.02B params)} &: \approx 2,500\text{ MiB (weights)} + 600\text{ MiB (4K KV Cache)} = 3,100\text{ MiB} \\
\text{BGE-M3 (F16, 566.7M params)} &: \approx 1,160\text{ MiB (weights)} + 300\text{ MiB (activation)} = 1,460\text{ MiB} \\
\hline
\mathbf{Total\ Concurrent\ VRAM\ Footprint} &: \approx \mathbf{5,950\text{ MiB}} \quad (\approx \mathbf{72.6\%}\text{ of 8,192 MiB}) \\
\mathbf{Remaining\ Safety\ Headroom} &: \approx \mathbf{2,242\text{ MiB}} \quad (\approx \mathbf{27.4\%})
\end{aligned}$$

### 8.2 Runtime Operational Constraints
1. **Single-Stream Execution:** Set `OLLAMA_NUM_PARALLEL=1` to prevent multiple concurrent generation streams from allocating redundant KV caches that could exceed the 2.2 GB headroom.
2. **Model Residency:** Both models fit comfortably inside the 8.0 GB card simultaneously without memory swapping.
3. **CPU Fallback / Degradation:** If background desktop applications suddenly claim > 2.2 GB VRAM, Ollama's dynamic layer offloader offloads trailing layers to host system RAM.
4. **Timeout & Circuit Breaking:** Adapter-level timeouts (30s cold load, 10s steady-state) prevent thread starvation.

---

## 9. Identified Blockers & Risk Mitigation

| Risk / Observation | Severity | Mitigation Strategy |
| :--- | :---: | :--- |
| **AI-01 ADRs in `PROPOSED` status** | Informational | Interfaces are formally defined in documentation. Implementation strictly conforms to documented contracts. |
| **System RAM availability (~2.48 GB free)** | Low | Ensure background desktop applications are minimized during large batch embedding jobs. |
| **Ollama daemon cold-start latency** | Low | First inference request may take 2–5s to load weights into VRAM. Handled by 30s timeout in adapters. |
| **Core platform dependency** | Critical Risk | Mitigated: `AI_ENABLED=false` by default. NestJS boots without errors when Ollama is stopped or unreachable. |

---

## 10. AI-02 Implementation Roadmap

1. **Stage 1 (Domain Core & Ports):** Define pure `ILLMProviderPort` and `IEmbeddingProviderPort` under `packages/core/src/ai/ports/outbound/`. Export cleanly through `@kinergy/core`.
2. **Stage 2 (Adapters & Resilience):** Implement `OllamaLLMAdapter`, `OllamaEmbeddingAdapter`, and mock fallbacks under `apps/api/src/ai/adapters/` using native Node `fetch`.
3. **Stage 3 (Configuration & Modular Wiring):** Implement `AiModule.forRoot()`, inject providers conditionally based on `AI_ENABLED` and `AI_PROVIDER`, and register `/api/v1/ai/health`.
4. **Stage 4 (Automated Quality Gates):** Execute unit tests, adapter contract tests, startup isolation tests, and live hardware integration tests.
$$
