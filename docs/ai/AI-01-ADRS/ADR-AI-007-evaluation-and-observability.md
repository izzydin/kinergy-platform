# ADR-AI-007: Evaluation, Telemetry & Observability Architecture

## 1. ADR Identifier

ADR-AI-007

## 2. Title

Multi-Tiered Observability, RAG Quality Evaluation, and Security Telemetry Architecture

## 3. Status

Proposed

## 4. Date

2026-11-19

## 5. Context

Retrieval-Augmented Generation systems exhibit probabilistic, non-deterministic behaviors that cannot be monitored solely through conventional HTTP status codes or uptime checks. A RAG pipeline can return HTTP 200 while producing hallucinated answers, citing irrelevant document chunks, or leaking internal prompt instructions. Operating an enterprise AI assistant requires granular visibility into embedding quality, vector retrieval precision, token consumption, inference latency, prompt injection attempts, and factual grounding. Furthermore, naive observability designs that dump entire prompts and chunks into log files risk creating massive secondary data-privacy leaks.

## 6. Problem Statement

How should evaluation, operational monitoring, and security auditing be architected so that RAG quality, cost, latency, and compliance are measurable and verifiable across model iterations without exposing sensitive document content or degrading runtime performance?

## 7. Decision Drivers

- **Factual Grounding & Hallucination Prevention**: Quantify and verify that assistant answers reflect the actual source documentation.
- **Privacy-Preserving Telemetry**: Forbid logging raw prompts, user PII, or full chunk contents in unencrypted application logs.
- **Controlled Quality Benchmarking**: Establish an automated golden evaluation dataset for regression testing prompt or model changes.
- **Failure Transparency**: Track provider latency, GPU VRAM saturation, and circuit breaker trip events in real time.
- **Audit Separation**: Segregate operational debug metrics from tamper-evident compliance audit logs.

## 8. Decision

We establish a **Multi-Tiered Evaluation and Observability Architecture** segregating operational telemetry, security audit logging, and offline golden-dataset benchmarking:

1. **Four-Tiered Observability Segregation**:
   - **Tier 1: Operational Monitoring (APM / Prometheus)**: Collects numerical system metrics: Time-to-First-Token (TTFT), tokens generated per second, HNSW vector search latency (ms), embedding generation latency, and circuit breaker health states.
   - **Tier 2: Structured Diagnostic Logging**: Application logs emit structured JSON carrying `X-Correlation-Id`. **Strict Privacy Masking Invariant**: User prompt text and raw document chunk strings are redacted or hashed; 1024-dim vector arrays are never logged to disk.
   - **Tier 3: Security & Compliance Auditing**: High-integrity audit events published to platform `IAuditEventPublisher` (`AI_QUERY_EXECUTED`, `AI_GUARDRAIL_BLOCKED`, `AI_DOCUMENT_UPLOADED`). Records principal ID, tenant ID, accessed document IDs, and citation counts without persisting full raw conversational text.
   - **Tier 4: Offline Quality Evaluation (RAG Triad & Benchmarking)**: Evaluation of model quality (faithfulness, answer relevance, context precision, context recall) conducted offline against an approved synthetic golden dataset.
2. **Offline Evaluation Dataset Strategy**:
   - Model and prompt updates must be evaluated against a curated, non-sensitive **Golden Evaluation Dataset** consisting of 50+ paired (Question, Reference Context, Expected Answer) entries based on published gym policies and equipment manuals.
   - **Clinical Data Prohibition**: In accordance with healthcare privacy mandates, **no real patient clinical records or unredacted SOAP notes may ever be used as evaluation benchmark data**.
3. **Core RAG Quality Metrics**:
   - **Faithfulness (Groundedness)**: Proportion of claims in the generated answer that can be inferred directly from the retrieved context chunks (target >95%).
   - **Answer Relevance**: Semantic similarity between the user's question and the generated answer (target >90%).
   - **Context Precision**: Signal-to-noise ratio of retrieved chunks (ensuring top-ranked chunks contain the answer).
   - **Context Recall**: Whether all factual elements necessary to answer the question were retrieved.
   - **Citation Correctness**: Verification that every cited `CitationReference` points to an existing chunk containing the referenced assertion.
4. **Automated Regression Quality Gates**:
   - In CI/CD or staging pre-releases, prompt updates or model migrations must execute the automated evaluation suite; releases that degrade faithfulness below 95% fail the quality gate automatically.

## 9. Alternatives Considered

- **Alternative 1: Full-Payload Debug Logging (Logging all prompts and completions to stdout)**: Simple to implement. _Rejected_: Severe security and privacy hazard. Any sensitive text or internal query typed by staff would leak into log aggregator systems (e.g. Datadog, CloudWatch, ELK), violating data minimization principles.
- **Alternative 2: Production User LLM-as-a-Judge on Every Request**: Running a second LLM evaluation call in real time for every user turn. _Rejected_: Doubles local GPU compute load, cuts concurrency in half on the 8GB RTX 3060 Ti, and increases Time-to-First-Token unacceptably. Quality evaluation is strictly an offline / sampled asynchronous process.
- **Alternative 3: Sole Reliance on Unit Tests**: Testing only software components with static assertions. _Rejected_: Unit tests verify code paths, but cannot detect semantic drift, prompt brittleness, or model degradation after model quantization updates.

## 10. Positive Consequences

- **Verifiable RAG Accuracy**: Architectural updates, prompt tweaks, and model migrations can be quantitatively benchmarked before hitting production.
- **Zero Log Leakage**: Strict redaction invariants guarantee that application logs remain free of sensitive enterprise content or credentials.
- **Real-Time Failure Alerts**: APM metrics immediately detect when local inference latency spikes or Ollama crashes.
- **Independent Security Auditing**: Provides a clear, tamper-evident audit trail of who queried the knowledge base and which documents were cited.

## 11. Negative Consequences

- Curating and maintaining a representative golden evaluation dataset requires ongoing domain expert oversight.
- Offline evaluation requires running test suites against an active model checkpoint.

## 12. Security Implications

- Fulfills OWASP Top 10 for LLM requirement LLM08 (Excessive Agency & Insufficient Monitoring).
- Detects prompt injection scanning and brute-force probing via `AI_GUARDRAIL_BLOCKED` alerts.

## 13. Operational Implications

- Prometheus scrapers capture `ai_retrieval_latency_ms`, `ai_generation_ttft_ms`, and `ai_tokens_total` with negligible CPU overhead.
- Operational logs remain compact and structured for fast querying.

## 14. Dependencies

- Platform `IAuditEventPublisher`.
- Structured logger (`NestJS Logger`).
- Golden Evaluation Dataset repository (`docs/ai/evaluation/`).

## 15. Implementation Implications

- Implement `IObservabilityPort` in `packages/core/src/ai/ports/outbound/observability.port.ts`.
- Integrate audit event emissions in `AskAssistantQuestionUseCase` and `ProcessDocumentUseCase`.
- Author evaluation script in `tools/scripts/eval-rag.ts`.

## 16. Validation Requirements

- Automated test verifying that log outputs for sample queries mask PII and omit 1024-dim embedding float arrays.
- Validation that `IAuditEventPublisher` records an event when an unauthorized scope query is attempted.

## 17. Conditions for Reconsideration

- If enterprise compliance requires external automated LLM observability tools (e.g. LangSmith, Arize Phoenix) that can be deployed self-hosted within the local network boundary.

## 18. Related ADRs

- ADR-AI-001: Dedicated AI bounded context
- ADR-AI-002: Local inference with Ollama
- ADR-AI-004: Embedding and model abstraction
- ADR-AI-006: RAG security and access control
