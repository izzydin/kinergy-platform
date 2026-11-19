# ADR-AI-005: Document Ingestion, Processing & Lifecycle Architecture

## 1. ADR Identifier

ADR-AI-005

## 2. Title

Asynchronous Document Ingestion, Semantic Chunking Strategy, and Idempotency Lifecycle

## 3. Status

Proposed

## 4. Date

2026-11-19

## 5. Context

Transforming unstructured organizational files (PDF, DOCX, Markdown, TXT) into searchable vector embeddings involves multi-step processing: binary staging, text extraction, cleaning, token-aware chunking, dense vector calculation, and transactional database insertion. Executing these operations synchronously within HTTP request-response cycles causes request timeouts, exhausts Node.js event loop threads during heavy parsing, and risks inconsistent partial database states if embedding generation fails midway.

## 6. Problem Statement

How should the document ingestion pipeline be architected to ensure idempotency, prevent duplicate processing, support multi-format parsing, avoid blocking HTTP threads, and maintain atomic consistency between document metadata and vector chunks?

## 7. Decision Drivers

- **Responsive User Experience**: Provide immediate upload confirmation (<500ms) without blocking on GPU embedding computation.
- **Deduplication & Idempotency**: Detect identical documents immediately to avoid redundant GPU compute and duplicate vector matches.
- **Storage Reuse**: Leverage Kinergy's existing `StorageModule` rather than creating duplicate storage infrastructure.
- **Semantic Chunk Cohesion**: Preserve coherent conceptual units without exceeding embedding model attention bounds.
- **Failure Recovery**: Support transparent error recording and safe reprocessing of failed documents.

## 8. Decision

We establish a **Decoupled Asynchronous Ingestion Pipeline** featuring SHA-256 deduplication, 512-token semantic chunking, and transactional lifecycle management:

1. **Reuse of Platform `StorageModule`**:
   - Raw binary files are staged via `ObjectStoragePort` under tenant-isolated paths: `storage://knowledge_base/{tenantId}/{documentId}/{filename}`.
   - Enforces Kinergy's established 10 MB file size limit and tenant storage quota.
2. **Idempotency & Duplicate Prevention**:
   - The ingestion use case computes the SHA-256 digest (`DocumentChecksum`) of uploaded bytes.
   - The database schema enforces a composite unique constraint: `UNIQUE (tenant_id, checksum)`.
   - If an active document with the same checksum exists in status `COMPLETED`, the upload is rejected with `DuplicateDocumentException`.
3. **Asynchronous Decoupling without Premature Queue Infrastructure**:
   - The upload endpoint (`POST /api/v1/ai/documents`) executes synchronously: validates file, stores raw bytes in `StorageModule`, records `KnowledgeDocument` in `PENDING` state, and returns HTTP 202 Accepted with the document ID.
   - **Queue Strategy**: Rather than introducing external queue infrastructure (e.g. Redis/BullMQ) before workload demands it, the pipeline uses a lightweight, transactional database job pattern (`IDocumentProcessingQueuePort`) or transactional event listener. Background processing is decoupled from the HTTP thread, but requires zero new infrastructure daemons.
4. **Text Extraction & Format Support**:
   - Supported formats: PDF, DOCX, Markdown (`.md`), plain text (`.txt`).
   - Uses pure JavaScript/TypeScript extractors (`unpdf` / `pdf-parse` for PDF; `mammoth` for DOCX). Native C++ compilation dependencies (e.g. Poppler, Tesseract OCR) are strictly avoided. Scanned image OCR is deferred.
5. **512-Token Semantic Chunking**:
   - Window size: 512 tokens.
   - Overlap: 64 tokens (preserves context across boundaries).
   - Splitting hierarchy: Markdown headers (`#`, `##`) $\rightarrow$ Paragraphs (`\n\n`) $\rightarrow$ Sentences (`. `) $\rightarrow$ Whitespace.
6. **Atomic Lifecycle States**:
   - State machine: `PENDING` $\rightarrow$ `VALIDATING` $\rightarrow$ `EXTRACTING` $\rightarrow$ `CHUNKING` $\rightarrow$ `EMBEDDING` $\rightarrow$ `COMPLETED` (or `FAILED`).
   - Availability states: `DRAFT` $\rightarrow$ `PUBLISHED` $\rightarrow$ `ARCHIVED`. Documents in `DRAFT` or `FAILED` are excluded from vector searches.

## 9. Alternatives Considered

- **Alternative 1: Synchronous Processing within Upload Request**: Parse, chunk, and embed during the HTTP POST. _Rejected_: A 50-page PDF requires 5-10 seconds of GPU embedding time; causes HTTP gateway timeouts (Nginx default 60s), locks user UI, and risks thread blocking.
- **Alternative 2: Introduce Redis and BullMQ Queue**: Heavy background queue system. _Rejected for initial phase_: Introduces a new database dependency (Redis) not currently in Kinergy's baseline infrastructure. The anticipated internal document ingestion volume (<50 documents per month) does not justify Redis operational overhead.
- **Alternative 3: Fixed Character-Count Chunking**: Splitting text every 1,000 characters. _Rejected_: Slices words and sentences in half, severing semantic context and degrading retrieval accuracy.

## 10. Positive Consequences

- **Instant Client Feedback**: Staff receive immediate confirmation and progress tracking via document status queries or SSE progress bars.
- **Zero Duplicate Compute**: Submitting an identical file twice costs 0 GPU cycles.
- **Zero Native Build Hazards**: Pure JS text parsers compile reliably across Windows, Linux, and macOS.
- **Atomic Rollback**: If embedding fails at chunk 40 of 50, the document transitions to `FAILED` without exposing partial, orphaned chunks to vector search.

## 11. Negative Consequences

- Frontend must implement polling or SSE status listeners to display when a document becomes searchable.
- PDF parsing without native OCR cannot extract text from scanned bitmap PDFs.

## 12. Security Implications

- Files are parsed in unprivileged Node.js memory; malicious PDF exploits cannot compromise host system binaries.
- MIME type sniffing and extension verification prevent arbitrary executable uploads.

## 13. Operational Implications

- Background processing consumes CPU during text extraction and GPU during embedding generation; batches are limited to 16 chunks to avoid spikes.
- Admins can reprocess failed documents via `POST /api/v1/ai/documents/:id/reprocess` without re-uploading the file.

## 14. Dependencies

- Milestone 10.5 `StorageModule` (`ObjectStoragePort`).
- Pure JS PDF extractor (`unpdf` / `pdf-parse`).
- Pure JS DOCX extractor (`mammoth`).
- `IEmbeddingProviderPort` for vectorization.

## 15. Implementation Implications

- Define `IDocumentExtractorPort` and `IDocumentChunkerPort` in `packages/core/src/ai/ports/outbound/`.
- Implement `IngestDocumentUseCase` and `ProcessDocumentUseCase`.
- Expose document management endpoints in `AiKnowledgeController`.

## 16. Validation Requirements

- Unit test verifying 512-token chunk boundaries and 64-token overlap on long-form sample policies.
- Idempotency test asserting that uploading the same file twice produces a `DuplicateDocumentException`.

## 17. Conditions for Reconsideration

- If document upload volume increases to hundreds of concurrent files daily, introducing a dedicated Redis/BullMQ worker cluster will be evaluated.
- If physical paper document scanning becomes a core clinic requirement, introducing Tesseract OCR or cloud OCR adapters will be evaluated.

## 18. Related ADRs

- ADR-AI-001: Dedicated AI bounded context
- ADR-AI-003: PostgreSQL and pgvector persistence
- ADR-AI-004: Embedding and model abstraction
- ADR-AI-006: RAG security and access control
