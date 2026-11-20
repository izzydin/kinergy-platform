# AI-04: Implementation Report — Document Extraction, Normalization & Chunking

## 1. Executive Summary

Milestone **AI-04** establishes the core document-processing pipeline for the `kinergy-platform` AI & Knowledge Management subsystem. It transforms heterogeneous raw source files (PDF, DOCX, Markdown, Text) into structured, normalized, provenance-preserving chunks ready for vector indexing in Milestone AI-05.

The implementation strictly honors:

- **Clean Architecture & Hexagonal Boundaries:** Framework-independent domain models and ports in `@kinergy-platform/core`; format adapters, Prisma repositories, and NestJS orchestration in `apps/api`.
- **Zero Vector Contamination:** No pgvector extensions, vector types, or embedding columns in `prisma/schema.prisma` or migration files.
- **Tenant & Version Isolation:** Every extracted block and chunk is pinned to an immutable tuple `(tenantId, documentId, documentVersionId)`.
- **Strict Data Privacy:** Document text is never logged to stdout, stderr, or logfiles.
- **Atomic Idempotent Persistence:** ACID transactional replacement prevents orphan or duplicated chunks.

---

## 2. Work Package Architecture & Deliverables

### AI-04.1: Extraction Domain Model & Parser Contracts

- **Ports & Interfaces:**
  - `IDocumentParserPort`: Format resolution, preflight compatibility check, and structured parsing.
  - `ExtractedDocument`: Aggregate representing structured extraction outputs.
  - `ExtractedBlock`: Structural units (Heading, Paragraph, Table, List, Code Block, Page Boundary).
  - `DocumentSourceLocation`: Offset and line tracking.
  - `DocumentExtractionException`: Structured error taxonomy with retryability classification.

### AI-04.2: Format-Specific Parsers

- **Composite Routing Adapter:** `CompositeDocumentParserAdapter` dynamically delegates to approved format-specific adapters.
- **PDF Parser (`PdfParserAdapter`):** Pure-JS `unpdf` implementation. Preserves 1-indexed page boundaries, detects scanned image-only PDFs (`UNSUPPORTED_FEATURE: OCR_REQUIRED`), and handles encrypted documents.
- **DOCX Parser (`DocxParserAdapter`):** `mammoth` implementation. Preserves H1-H6 heading hierarchy, tables, lists, and guards against zip-bomb archive expansion limits.
- **Markdown Parser (`MarkdownParserAdapter`):** `marked` lexer AST parser. Preserves nested headings, code fences, tables, and sanitizes dangerous HTML/script tags.
- **Plain Text Parser (`PlainTextParserAdapter`):** Native UTF-8 stream decoder. Handles BOM markers and detects binary null-byte corruption.

### AI-04.3: Normalization & Language Detection

- **Normalization Service (`DeterministicDocumentNormalizerService`):**
  - Unicode NFKC normalization.
  - Line-break hyphenation unwrapping (`rehabili-\ntación` $\rightarrow$ `rehabilitación`).
  - Strips invisible formatting artifacts (ZWNJ, soft hyphens) while strictly preserving table columns, code indentation, monetary values (`$45.000 CLP`), dates, and Chilean RUT identifiers (`76.543.210-K`).
- **Language Detector (`DeterministicLanguageDetectorService`):**
  - High-precision statistical stopword and n-gram classifier for Spanish (`es`) and English (`en`).
  - Achieves 100% classification accuracy on evaluation corpus without external runtime dependencies.

### AI-04.4: Token-Aware Structure-Preserving Chunking

- **Tokenizer Port & Adapter:** `DeterministicBpeTokenizerAdapter` implementing `cl100k_base` / XLM-RoBERTa calibration for Spanish and English.
- **Chunking Engine (`StructureAwareChunkerService`):**
  - Strict hierarchical boundary prioritization: `Section -> Heading -> Paragraph -> List -> Sentence -> Token subdivision`.
  - Configurable limits: `targetChunkTokens = 450`, `minimumChunkTokens = 400`, `maximumChunkTokens = 500`, `overlapTokens = 60`.
  - Deterministic sentence-aligned overlap within the same section.
  - Table header row preservation across table sub-chunks.
  - Code fence preservation across code sub-chunks.
  - Complete provenance tracking: deterministic RFC 4122 UUID chunk IDs, SHA-256 content checksums, section breadcrumbs.

### AI-04.5: Pipeline Integration & Relational Persistence

- **Relational Schema:** Additive table `knowledge_chunks` created via migration `20261119010000_add_knowledge_chunks_table`.
- **Repository Adapter:** `PrismaKnowledgeChunkRepository` executing atomic replacement (`prisma.$transaction([deleteMany, createMany])`).
- **Pipeline Orchestrator:** `DocumentProcessingPipelineService` wired into Stage 2 (`PROCESSING`) of `IngestionOrchestratorService` with cooperative cancellation checks (`isCancelled`) between stages.
- **Error & Retry Classification:** Integrated with `IngestionRetryPolicy` for exponential backoff on transient errors and immediate failure with document preservation on fatal format corruptions.

### AI-04.6: Quality Evaluation & NLP Audit

- **Representative Corpus:** 11 documents across all 4 formats and business domains.
- **Quality Scorecard:** 100% parsing success, 100% language accuracy, 100% provenance completeness, 100% determinism across 3 iterations, and hard bounded token counts ($\le 500$).

---

## 3. Dependency Inventory & Audit

All dependencies introduced in AI-04 conform to security and licensing standards:

| Package    | Version   | Purpose                        | License      | Transitive CVEs |
| :--------- | :-------- | :----------------------------- | :----------- | :-------------- |
| `unpdf`    | `^2.2.1`  | In-process PDF extraction      | MIT          | 0               |
| `mammoth`  | `^1.9.1`  | In-process DOCX extraction     | BSD-2-Clause | 0               |
| `marked`   | `^15.0.7` | In-process Markdown AST lexing | MIT          | 0               |
| `tiktoken` | `^1.0.22` | BPE subword tokenization       | MIT          | 0               |

---

## 4. Verification Evidence Summary

- **TypeScript Compilation:** `pnpm typecheck` passed with **0 errors**.
- **Core Domain & Persistence:** `pnpm nx test core` passed **309/309 suites** (4,722 tests).
- **API AI Module:** `pnpm nx test api --testPathPattern="apps/api/src/ai"` passed **26/26 suites** (309 tests).
- **Client Domain:** `pnpm nx test client-domain` passed **22/22 suites** (161 tests).
- **UI Component Foundation:** `pnpm nx test ui` passed **10/10 suites** (176 tests).
- **Web Application:** `pnpm nx test web` passed **200/200 suites** (2,327 tests).
