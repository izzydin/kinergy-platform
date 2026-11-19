# ADR-AI-002: Local Inference Adapter with Ollama & Generation Engine

## 1. ADR Identifier

ADR-AI-002

## 2. Title

Adoption of Ollama as Initial Local Inference Adapter and Qwen 4B as Proposed Generation Model

## 3. Status

Proposed

## 4. Date

2026-11-19

## 5. Context

Kinergy manages sensitive health, fitness, and operational business documentation. Transmitting prompt queries and proprietary documentation to public cloud LLMs (OpenAI, Anthropic, Google Gemini) introduces ongoing operational costs, network latency dependencies, and data sovereignty/privacy compliance concerns under clinical regulations. Hardware inspection in AI-00 verified an **NVIDIA GeForce RTX 3060 Ti with 8,192 MiB GDDR6 VRAM** (6.3 GB free). The platform requires a self-hosted inference capability capable of running generation within this physical memory envelope.

## 6. Problem Statement

How should conversational text generation be executed locally on host infrastructure without locking the application domain to a specific inference engine, violating VRAM constraints, or risking platform downtime if the inference daemon fails?

## 7. Decision Drivers

- **Data Sovereignty & Privacy**: Ensure zero data egress for internal operational documentation.
- **Cost Predictability**: Eliminate per-token cloud API operating expenses.
- **Hardware Envelope**: Fit generation model and embedding model simultaneously inside 8,192 MiB physical VRAM.
- **Provider Independence**: Shield application and domain layers from inference engine APIs via pure hexagonal ports.
- **Failure Isolation**: Prevent inference crashes or timeouts from interrupting core clinic/gym business operations.

## 8. Decision

We evaluate **Ollama** as the proposed initial local inference adapter and propose **Qwen 4B (specifically `qwen2.5:3b` / `qwen2.5:7b-instruct-q4_K_M` or quantized 4B equivalent)** as the primary local generation model.

1. **Hexagonal Decoupling**: The application layer depends strictly on `ILLMProviderPort`. The `OllamaLLMAdapter` implements this port via standard HTTP calls (`/api/generate`, `/api/chat`). No Ollama SDK or API types leak into the application core.
2. **VRAM Budget Allocation**:
   - Generation Model (Qwen 4B quantized Q4_K_M): ~2,800 MiB (2.8 GB) VRAM.
   - Embedding Model (BGE-M3): ~1,500 MiB (1.5 GB) VRAM.
   - Host OS / Display Overhead: ~1,800 MiB (1.8 GB) VRAM.
   - Dynamic KV Cache & Context Headroom: ~2,000 MiB (2.0 GB) VRAM.
   - Total Footprint: 8,100 MiB (fits within 8,192 MiB card with zero OOM margin).
3. **Operational Concurrency Constraint**: On 8GB VRAM, Ollama must run with `OLLAMA_NUM_PARALLEL=1`. Generation requests must be serialized at the adapter level to prevent VRAM thrashing.
4. **Failure Isolation**: The adapter implements a 3-second timeout and an in-memory circuit breaker. If Ollama fails, it trips and fast-fails within 2ms (HTTP 503), ensuring core gym turnstiles, scheduling, and billing remain 100% operational.
5. **Runtime Validation Requirement**: Ollama is proposed, not assumed production-ready. Local Docker WSL 2 GPU passthrough and token generation speed must be empirically validated before deployment.

## 9. Alternatives Considered

- **Alternative 1: Cloud-Only LLM (OpenAI / Anthropic / Gemini)**: Zero local GPU footprint, higher reasoning capacity. _Rejected for default baseline_: Violates strict local data sovereignty requirements and introduces variable operational cost. However, the hexagonal architecture allows cloud adapters to be introduced if approved.
- **Alternative 2: Self-Hosted vLLM / TGI**: High throughput server engines. _Rejected_: Heavy Linux-only container setups with larger memory overhead, difficult to configure on Windows WSL 2 with limited 8GB VRAM.
- **Alternative 3: llama.cpp Direct Node.js Addon**: Direct in-process binding. _Rejected_: Compiling native C++ addons inside Node.js creates severe build instability across developer machines and risks crashing the Node.js API process on memory faults.

## 10. Positive Consequences

- **100% On-Premises Privacy**: All prompt assemblies, context chunks, and user queries remain strictly within the local host boundary.
- **Zero Ongoing API Fees**: Predictable cost irrespective of staff query volume.
- **Low Latency Streaming**: Token streaming over local PCIe bus delivers Time-to-First-Token in under 400ms.
- **Clean Adapter Portability**: The system can switch from Ollama to vLLM, llamafile, or cloud APIs by authoring a single adapter class without editing domain logic.

## 11. Negative Consequences

- Model reasoning is bounded by the 4B parameter class; complex multi-step reasoning is less capable than frontier 70B+ cloud models.
- Single-stream GPU execution requires request queuing under concurrent load.
- Host must maintain active GPU drivers and Docker WSL 2 passthrough.

## 12. Security Implications

- Total elimination of third-party cloud data transmission risks.
- Local inference daemon must listen strictly on `localhost` or an internal Docker bridge network; exposing port 11434 to external networks is strictly prohibited.

## 13. Operational Implications

- Cold starts require model weight loading (~5-10s) upon first request unless configured with `keep_alive: "15m"`.
- Requires monitoring GPU temperature and VRAM utilization under peak operational periods.

## 14. Dependencies

- Host NVIDIA CUDA Driver 616.92+.
- Docker Desktop with WSL 2 and NVIDIA Container Toolkit.
- Target model weights: `qwen2.5:3b` or `qwen2.5:7b-instruct-q4_K_M`.

## 15. Implementation Implications

- Author `OllamaLLMAdapter` in `apps/api/src/ai/adapters/llm/ollama-llm.adapter.ts`.
- Add internal configuration properties: `AI_OLLAMA_BASE_URL`, `AI_LLM_MODEL`.
- Implement circuit breaker logic to isolate failures.

## 16. Validation Requirements

- Live runtime benchmarking of tokens/second on host RTX 3060 Ti GPU.
- Verification that Ollama recovers gracefully from OOM without bringing down Docker.
- Validation of SSE streaming response time via API gateway.

## 17. Conditions for Reconsideration

- If Ollama GPU containerization proves unstable on Windows WSL 2, running Ollama as a native Windows daemon or transitioning to self-hosted cloud instances will be evaluated.
- If business requirements demand complex multi-lingual clinical reasoning exceeding 4B capabilities, authorized cloud fallback for non-PHI documents may be proposed.

## 18. Related ADRs

- ADR-AI-001: Dedicated AI bounded context
- ADR-AI-004: Embedding and model abstraction
- ADR-AI-007: Evaluation and observability
