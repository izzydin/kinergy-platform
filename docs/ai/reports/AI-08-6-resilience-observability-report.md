# AI-08.6 — Generation Resilience & Observability Report

> **Milestone:** AI-08 — RAG Orchestration & Grounded Answer Generation  
> **Subtask:** AI-08.6 — Generation Resilience & Observability  
> **Status:** APPROVED & COMPLETE (`PASS`)  
> **Date:** 2026-11-21  
> **Author:** Antigravity Agentic Assistant / Kynergy Platform Architecture Team

---

## 1. Executive Summary & Objective

In a clinical and enterprise retrieval-augmented generation (RAG) platform, generation resilience and operational observability are critical pillars. Naive LLM integrations suffer from cascading failures: hanging network sockets, unbounded retry storms, resource starvation under high concurrency, unhandled provider outages, and blind telemetry that either exposes protected health information (PHI) or leaves operators blind to system degradation.

**AI-08.6** establishes an enterprise-grade resilience and observability architecture across the entire generation lifecycle. Key achievements include:

1. **End-to-End Deadline Propagation:** Unified pipeline deadline budgets with `AbortController` combining client cancellation with configurable per-stage timeouts (retrieval, context construction, generation, overall).
2. **Bounded Transient Retry Engine:** Strict classification of transient errors (timeouts, provider socket failures, malformed JSON) with exponential backoff and jitter, while permanently failing on non-recoverable configuration or validation errors.
3. **Native Request Cancellation:** Upstream client disconnects propagate directly to the Ollama LLM provider, aborting generation mid-stream and freeing GPU compute.
4. **Adaptive Circuit Breaker:** In-memory state machine (`CLOSED` $\rightarrow$ `OPEN` $\rightarrow$ `HALF_OPEN`) preventing provider overload during downstream degradation.
5. **HIPAA-Compliant Generation Telemetry:** Structured JSON telemetry (`ai_grounded_generation`) with zero PHI/PII leakage, tracking stage latencies, outcome classifications, and percentiles (p50, p95, p99).

---

## 2. Timeout Policy & Request Budget Architecture (Phase 1)

### 2.1 Configuration Budget Specification

Timeouts are configured centrally in `AiConfiguration` with safe defaults:

| Timeout Dimension    | Config Parameter          | Default Value | Scope / Responsibility                             |
| :------------------- | :------------------------ | :------------ | :------------------------------------------------- |
| **Retrieval Stage**  | `retrievalTimeoutMs`      | `5,000 ms`    | Semantic search, BM25, and hybrid fusion deadline  |
| **Context Builder**  | `contextBuilderTimeoutMs` | `1,000 ms`    | Token budgeting, deduplication, and XML formatting |
| **Generation Stage** | `generationTimeoutMs`     | `20,000 ms`   | Ollama model generation per single attempt         |
| **Overall Request**  | `requestTimeoutMs`        | `30,000 ms`   | End-to-end pipeline execution ceiling              |

### 2.2 Pipeline Deadline Propagation

In `RAGOrchestratorService`, the overall request deadline is enforced via an integrated `AbortController`:

```typescript
const pipelineController = new AbortController();
const overallTimeout = setTimeout(() => {
  pipelineController.abort();
}, requestBudgetMs);

// Link upstream client cancellation if provided
if (command.signal) {
  command.signal.addEventListener('abort', () => pipelineController.abort(), { once: true });
}
```

This controller signal is passed to both `ISemanticSearchUseCase` and `IGroundedGenerationPort`. If retrieval consumes 4.8 seconds of a 5.0-second retrieval budget, the generation phase receives the remaining request budget rather than hanging indefinitely.

---

## 3. Transient Retry Policy & Error Taxonomy (Phase 2)

### 3.1 Failure Classification

To prevent retry storms and duplicate generation load, errors are strictly categorized:

```
                          ┌───────────────────────────┐
                          │     Generation Error      │
                          └─────────────┬─────────────┘
                                        │
                 ┌──────────────────────┴──────────────────────┐
                 ▼                                             ▼
     [ Transient Failure ]                         [ Permanent Failure ]
     • ProviderTimeoutException                    • ModelNotFoundException
     • LLMProviderUnavailableException             • AiConfigurationInvalidException
     • Malformed JSON (syntax error)               • InputTooLargeException
     • Socket ECONNRESET / ETIMEDOUT               • GenerationCancelledException
                 │                                 • UnauthorizedRetrievalException
                 ▼                                             │
      Retry with Backoff & Jitter                              ▼
    (Max 1 retry; 200ms - 1000ms)                  Fail Immediately (No Retry)
```

### 3.2 Bounded Backoff with Jitter

Retries are bounded by `generationMaxRetries: 1` (allowing at most 2 attempts total). The delay is calculated using truncated exponential backoff with random jitter:

$$\text{delay} = \min\left(\text{maxDelay}, \text{baseDelay} \times 2^{\text{attempt}} + \text{random}(0, 50)\right)$$

### 3.3 Idempotency & Persistence Safety

Conversation turn recording (`IConversationHistoryManagerPort.recordTurn`) is strictly non-idempotent. The orchestrator guarantees that session history recording occurs **only once** upon final successful answer synthesis or short-circuit abstention. Intermediate retry attempts never persist duplicate messages.

---

## 4. Native Request Cancellation (Phase 3)

Request cancellation is fully supported across all layers:

1. **API / Client Boundary:** When an HTTP client closes the connection, the incoming `AbortSignal` is captured.
2. **Orchestrator Coordination:** `pipelineController.abort()` triggers when the client signal aborts.
3. **Provider Level (Ollama LLM Adapter):** The adapter passes `signal` directly to the `fetch` request calling `/api/generate`. When aborted, Node/V8 terminates the HTTP socket immediately.
4. **Exception Handling:** Aborted requests throw `GenerationCancelledException`, recorded with outcome `CANCELLED` in telemetry, and avoid downstream processing.

---

## 5. Resource Controls & Circuit Breaker (Phase 4)

### 5.1 In-Memory Circuit Breaker State Machine

`OllamaLLMAdapter` implements a deterministic circuit breaker protecting the local Ollama instance:

```
               [ Consecutive Failures < Threshold (3) ]
                     ┌───────────────────────┐
                     ▼                       │
               ┌───────────┐                 │
      ┌───────>│  CLOSED   │─────────────────┘
      │        └─────┬─────┘
      │              │ Consecutive Failures >= Threshold (3)
      │              ▼
      │        ┌───────────┐
      │        │   OPEN    │  (Rejects all traffic immediately with
      │        └─────┬─────┘   LLMProviderUnavailableException)
      │              │
      │              │ Cooldown Elapsed (10,000ms)
      │              ▼
      │        ┌───────────┐
      │        │ HALF_OPEN │  (Canary probe request permitted)
      │        └─────┬─────┘
      │ Success      │
      └──────────────┘ Failure -> Back to OPEN
```

### 5.2 Circuit Breaker Metrics & Status

The circuit breaker exposes live telemetry via `getCircuitBreakerStatus()`:

- `state`: Current state (`CLOSED`, `OPEN`, `HALF_OPEN`).
- `failures`: Consecutive failure count.
- `lastFailureTime`: Millisecond timestamp of most recent failure.
- `isOpen`: Boolean flag for fast routing checks.

---

## 6. Generation Observability & Telemetry (Phase 5)

### 6.1 Structured Telemetry Event Specification

The `GenerationObservabilityService` emits structured JSON events with event type `ai_grounded_generation`:

```json
{
  "timestamp": "2026-11-21T13:35:09.771Z",
  "event": "ai_grounded_generation",
  "requestId": "req-1795268109656",
  "correlationId": "req-1795268109656",
  "tenantId": "tenant-clinica-alpha",
  "userPseudonym": "3d879077f1cb3c6e",
  "queryHash": "947c5302468ffbe04513176c999787c061a403e93681f3f5a6467240922cfbb2",
  "queryLength": 20,
  "modelIdentifier": "qwen3:4b",
  "promptVersion": "kinergy-rag-v1.0.0",
  "retrievalCount": 3,
  "contextChunkCount": 3,
  "inputTokenEstimate": 420,
  "outputTokenCount": 65,
  "retrievalDurationMs": 142,
  "contextDurationMs": 8,
  "generationDurationMs": 1280,
  "validationDurationMs": 14,
  "totalDurationMs": 1444,
  "retryCount": 0,
  "outcome": "SUCCESS",
  "timeoutStatus": false,
  "abstentionStatus": false,
  "citationCount": 2,
  "isGrounded": true
}
```

### 6.2 Strict Sensitive Data Exclusion (Healthcare Privacy Invariant)

To guarantee compliance with HIPAA, GDPR, and medical privacy standards, telemetry adheres to strict exclusion rules:

1. **NO Raw Query Strings:** Queries are never logged in plain text. Telemetry records only `queryLength` and `queryHash` (SHA-256).
2. **NO Clinical Content:** Retrieved document chunks, patient records, and generated clinical answer text are strictly excluded.
3. **NO Prompts or System Instructions:** System prompts and XML contexts are never stored in telemetry logs.
4. **NO Authentication Credentials:** Bearer tokens, passwords, and API secrets are strictly stripped.
5. **Pseudonymous User IDs:** User IDs are irreversibly pseudonymized via HMAC-SHA256 (`userPseudonym`) using a tenant-specific salt.

### 6.3 Aggregated Metrics & Ring Buffer

`GenerationObservabilityService` maintains an in-memory circular buffer of the last 500 generation events. It calculates real-time operational metrics:

- **Total Requests & Success Rate:** Breakdown by outcome (`SUCCESS`, `ABSTAINED`, `UNGROUNDED`, `TIMEOUT`, `CANCELLED`, `PROVIDER_ERROR`).
- **Latency Percentiles:** Computes p50, p95, p99, min, max, and mean latencies across all stages.
- **Abstention & Groundedness Ratios:** Tracks clinical abstention frequency and hallucination prevention rates.

---

## 7. Verification & Test Execution Results (Phase 6)

A comprehensive test suite of 11 dedicated scenarios was implemented in `apps/api/src/ai/services/rag/__tests__/generation-resilience.spec.ts`.

### 7.1 Resilience Test Matrix

| ID         | Scenario                          | Verified Resilience Behavior                                                         | Status   |
| :--------- | :-------------------------------- | :----------------------------------------------------------------------------------- | :------- |
| **RES-01** | Pipeline Request Timeout          | Request deadline triggers `ProviderTimeoutException`, emits `outcome: 'TIMEOUT'`     | **PASS** |
| **RES-02** | Upstream Client Cancellation      | AbortSignal triggers `GenerationCancelledException`, emits `outcome: 'CANCELLED'`    | **PASS** |
| **RES-03** | Transient Timeout Retry           | Transient socket timeout triggers backoff retry and succeeds on attempt 2            | **PASS** |
| **RES-04** | Malformed JSON Retry              | Unparseable JSON output retried with strict JSON formatting, succeeds                | **PASS** |
| **RES-05** | Permanent Error Non-Retry         | `ModelNotFoundException` fails immediately with zero retries                         | **PASS** |
| **RES-06** | Circuit Breaker Trip to OPEN      | 3 consecutive provider failures transition circuit to `OPEN`, rejects traffic fast   | **PASS** |
| **RES-07** | Circuit Breaker Cooldown Recovery | After cooldown, circuit transitions to `HALF_OPEN` and resets to `CLOSED` on success | **PASS** |
| **RES-08** | Success Structured Telemetry      | Emits full stage latencies, counts, pseudonymized user, and `isGrounded: true`       | **PASS** |
| **RES-09** | Sensitive Data Exclusion Check    | Zero presence of raw query, prompt, chunk text, or secrets in telemetry event        | **PASS** |
| **RES-10** | Single Session Recording          | History recording is executed exactly once on success or abstention                  | **PASS** |
| **RES-11** | Metrics Ring Buffer & Percentiles | Calculates correct p50, p95, p99 latencies, total counts, and error rates            | **PASS** |

### 7.2 Monorepo Test Summary

```
PASS  apps/api/src/ai/services/rag/__tests__/generation-resilience.spec.ts (11 tests)
PASS  apps/api/src/ai/services/rag/__tests__/conversation-history-manager.service.spec.ts (10 tests)
PASS  apps/api/src/ai/services/rag/__tests__/citation-validator.service.spec.ts (12 tests)
PASS  apps/api/src/ai/services/rag/__tests__/rag-orchestrator.service.spec.ts (11 tests)
PASS  apps/api/src/ai/services/rag/__tests__/grounded-generation.service.spec.ts (14 tests)
PASS  apps/api/src/ai/services/rag/__tests__/rag-context-builder.service.spec.ts (12 tests)
PASS  apps/api/src/ai/adapters/conversation/__tests__/in-memory-conversation-repository.adapter.spec.ts (5 tests)
PASS  packages/core/src/ai/domain/__tests__/conversation-session.model.spec.ts (12 tests)
PASS  packages/core/src/ai/domain/__tests__/rag-contracts.spec.ts (10 tests)
PASS  packages/core/src/ai/domain/__tests__/chat-message.vo.spec.ts (4 tests)

Total AI Subsystem Tests: 101 passed, 101 total (100% PASS)
TypeScript Monorepo Compilation (`tsc --noEmit`): 0 errors
Prettier Code Style Check: 100% clean
```

---

## 8. Conclusion & Milestone Acceptance

With the completion of **AI-08.6**, the RAG generation pipeline satisfies all requirements for production reliability, operational observability, and clinical privacy:

- Unbounded hanging calls are eliminated via end-to-end deadline budgets.
- Provider transient blips are absorbed via bounded backoff retries.
- Client cancellations free backend GPU and network resources immediately.
- Failing models trigger circuit breaker protection rather than cascading failure.
- Complete operational visibility is provided via structured JSON telemetry without violating patient privacy or security policies.

**Subtask AI-08.6 is officially COMPLETE and approved (`PASS`).**
