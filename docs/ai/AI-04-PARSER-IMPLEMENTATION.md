# AI-04.2 — Document Parser Implementations

## 1. Executive Summary & Architectural Alignment

Milestone **AI-04.2** implements concrete, format-specific document parser adapters conforming strictly to the framework-agnostic `IDocumentParserPort` outbound contract established in `AI-04.1` (`@kinergy-platform/core`).

Each adapter is housed within the application infrastructure layer (`apps/api/src/ai/adapters/parsers/`) and adheres to the following principles:

- **Clean Architecture & Hexagonal Boundaries:** Domain contracts remain 100% agnostic of parser SDKs (`unpdf`, `mammoth`, `marked`). Domain models (`ExtractedDocument`, `ExtractedBlock`, `SourceLocation`) and domain exceptions (`InvalidFormatExtractionException`, `UnsupportedDocumentFeatureException`, `ExtractionResourceLimitExceededException`, `EmptyExtractedDocumentException`, `CorruptDocumentExtractionException`) enforce domain invariants without external leakage.
- **Zero OCR Implementation:** Scanned or image-only PDFs containing zero extractable text are explicitly classified and rejected with `UnsupportedDocumentFeatureException` carrying the code `OCR_REQUIRED`. OCR execution remains out of scope for this milestone.
- **Strict Provenance Integrity:** Format-appropriate provenance is preserved. Multi-page PDFs maintain sequential 1-indexed `pageNumber` attributes and `PAGE_BOUNDARY` synthetic blocks. Unpaginated formats (DOCX, Markdown, Plain Text) never fabricate page numbers (`pageNumber: null`), and plain text maintains verifiable line-range provenance (`startLine`, `endLine`).
- **Defensive In-Memory Parsing & Resource Limits:** Ingestion operates on in-memory buffers with strict preflight validation (file size constraints, execution timeouts, decompression limits, and binary sniffers) protecting against denial-of-service (DoS) and malicious document exploits.

---

## 2. Dependency Audit & Security Vetting

All third-party libraries integrated in this milestone were vetted during `AI-04.0` readiness assessment and confirmed to meet enterprise standards:

| Package                  | Version  | License      | Maintenance / Activity  | Scope / Purpose                                                             | Transitive / Native Dependencies                              |
| :----------------------- | :------- | :----------- | :---------------------- | :-------------------------------------------------------------------------- | :------------------------------------------------------------ |
| **`unpdf`**              | `2.2.1`  | MIT          | Active (UnJS ecosystem) | Pure JavaScript PDF text extraction, page counting, and metadata extraction | Pure JS wrapper around `pdfjs-dist`; zero native C++ bindings |
| **`mammoth`**            | `1.13.0` | BSD-2-Clause | Active                  | DOCX OpenXML conversion to semantic HTML without macro or script execution  | Pure JS; zero native bindings                                 |
| **`marked`**             | `18.2.1` | MIT          | Active                  | Markdown AST tokenization via `marked.lexer` (no HTML rendering)            | Pure JS; zero native bindings                                 |
| **Native `TextDecoder`** | Node 24  | Built-in     | Node.js Runtime         | Plain text streaming decoding (UTF-8, Latin-1 fallback, BOM handling)       | Zero external dependencies                                    |

---

## 3. Format-Specific Parser Implementations

### 3.1. PDF Parser (`PdfParserAdapter`)

- **Location:** [`apps/api/src/ai/adapters/parsers/pdf-parser.adapter.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/ai/adapters/parsers/pdf-parser.adapter.ts)
- **Supported Format:** `DocumentFormat.PDF` (`application/pdf`)
- **Key Capabilities:**
  - **Sequential Page Boundaries:** Generates a synthetic `PAGE_BOUNDARY` block before each page's content, recording the 1-indexed `pageNumber` and `pageIndex`.
  - **Reading Order & Paragraph Preservation:** Splits page text streams into discrete paragraphs separated by blank lines while associating each paragraph with its originating page number.
  - **Scanned PDF Classification (`OCR_REQUIRED`):** When `totalPages > 0` but total non-whitespace extractable characters across all pages equals `0`, the adapter explicitly throws `UnsupportedDocumentFeatureException('OCR_REQUIRED')`. This prevents misclassifying image-only medical reports as empty files while safely signaling downstream OCR workflows.
  - **Encrypted Document Defense:** Preflight and runtime inspection detects `/Encrypt` dictionaries and password protection, throwing `UnsupportedDocumentFeatureException('ENCRYPTED_PDF')`.
  - **Resource Guards:** Configurable `maxSizeBytes` (default 10 MB), `maxPages` (default 500 pages), and `timeoutMs` (default 30 seconds).

### 3.2. DOCX Parser (`DocxParserAdapter`)

- **Location:** [`apps/api/src/ai/adapters/parsers/docx-parser.adapter.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/ai/adapters/parsers/docx-parser.adapter.ts)
- **Supported Format:** `DocumentFormat.DOCX` (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`)
- **Key Capabilities:**
  - **ZIP Bomb Defense:** Custom in-memory parser inspects the ZIP Central Directory prior to decompression. Enforces:
    - Maximum decompressed size: 50 MB (`MAX_DOCX_UNCOMPRESSED_BYTES`).
    - Maximum compression ratio: 100:1 (rejects decompression expansion attacks).
    - Maximum entry count: 1,000 files.
  - **VBA Macro Neutralization:** Central directory scanner inspects entry filenames for `word/vbaProject.bin`, `word/vbaData.xml`, or `.bin` macros. Rejects with `UnsupportedDocumentFeatureException('VBA_MACROS')`.
  - **Structural Preservation Without Flattening:** Converts DOCX to clean semantic HTML via Mammoth, extracting:
    - `HEADING` blocks (H1 through H6) maintaining hierarchical `sectionPath` context.
    - `TABLE` blocks preserving row/col structure, Markdown table formatting, and `tableMetadata` (`rowCount`, `colCount`, `headers`), preventing flattening into ambiguous text.
    - `LIST_ITEM` blocks from `<ul>`, `<ol>`, or bulleted paragraphs (`•`, `-`, numbered).
    - `PARAGRAPH` blocks without fabricated page numbers (`pageNumber: null`).
  - **Document Title Detection:** Captures the first H1 heading as document title, falling back to sanitized file name.

### 3.3. Markdown Parser (`MarkdownParserAdapter`)

- **Location:** [`apps/api/src/ai/adapters/parsers/markdown-parser.adapter.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/ai/adapters/parsers/markdown-parser.adapter.ts)
- **Supported Format:** `DocumentFormat.MARKDOWN` (`text/markdown`)
- **Key Capabilities:**
  - **AST Tokenization without HTML Execution:** Uses `marked.lexer` to parse structured Markdown tokens into domain blocks without rendering HTML, preventing XSS and script injection.
  - **Heading Hierarchy Stack:** Tracks nested sections (e.g. `['Manual Clínico', '1. Evaluación', '1.1 Articular']`) ensuring all subordinate blocks inherit their full parent section path.
  - **Preserved Constructs:** Preserves `HEADING`, `PARAGRAPH`, `LIST_ITEM`, `TABLE` (with row/col counts and headers), `CODE_BLOCK` (with programming language tag), `BLOCKQUOTE`, and `DIVIDER`.
  - **Unpaginated Provenance:** Verifies `pageNumber: null` across all blocks and `doc.pageCount === 0`.
  - **Encoding & Sanitization:** Handles UTF-8 with BOM and rejects embedded null bytes.

### 3.4. Plain Text Parser (`PlainTextParserAdapter`)

- **Location:** [`apps/api/src/ai/adapters/parsers/plain-text-parser.adapter.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/ai/adapters/parsers/plain-text-parser.adapter.ts)
- **Supported Format:** `DocumentFormat.TXT` (`text/plain`)
- **Key Capabilities:**
  - **Multi-Encoding Support:** Defaults to UTF-8 with strict error handling (`fatal: true`). If invalid byte sequences are detected, gracefully falls back to ISO-8859-1 (Latin-1).
  - **UTF-8 BOM Support:** Automatically strips UTF-8 BOM (`0xEF, 0xBB, 0xBF`) without corrupting line offsets.
  - **Spanish Accent Fidelity:** Validated against Spanish clinical vocabulary (`fisioterapéutica`, `lumbalgia mecánica`, `estática pélvica`, `kinesiólogo`, `¿?`, `¡!`).
  - **Line-Range Provenance:** Uses `SourceLocation.create({ startLine, endLine, pageNumber: null })` on every extracted paragraph.
  - **Binary Sniffing:** Scans the first 4 KB and fails immediately with `InvalidFormatExtractionException` if null bytes (`0x00`) are detected.

### 3.5. Composite Parser Adapter (`CompositeDocumentParserAdapter`)

- **Location:** [`apps/api/src/ai/adapters/parsers/composite-document-parser.adapter.ts`](file:///c:/Projects/kinergy-platform/apps/api/src/ai/adapters/parsers/composite-document-parser.adapter.ts)
- **Purpose:** Acts as the unified outbound port implementation for the AI module. Inspects incoming `DocumentFormat` and dispatches `validateCompatibility` and `parse` requests to the corresponding adapter.
- **Open-Closed Principle:** New document formats can be registered by supplying additional `IDocumentParserPort` delegates without modifying existing parser logic.
- **Fail-Safe Dispatching:** If an unsupported format is requested, immediately returns `isCompatible: false` during validation or throws `UnsupportedFormatExtractionException` during parsing.

---

## 4. Error Mapping Matrix

All low-level library exceptions are intercepted and re-mapped into standard `@kinergy-platform/core` domain exceptions:

| Raw Failure Condition                    | Library Exception       | Domain Exception                           | Error Code                             | Retryable? |
| :--------------------------------------- | :---------------------- | :----------------------------------------- | :------------------------------------- | :--------- |
| Non-PDF buffer or missing `%PDF` header  | Parse Error             | `InvalidFormatExtractionException`         | `INVALID_FORMAT`                       | No         |
| Password-protected or encrypted PDF      | Encrypted PDF error     | `UnsupportedDocumentFeatureException`      | `UNSUPPORTED_FEATURE`                  | No         |
| PDF has pages but 0 non-whitespace text  | Unpdf 0 chars           | `UnsupportedDocumentFeatureException`      | `UNSUPPORTED_FEATURE` (`OCR_REQUIRED`) | No         |
| Missing `[Content_Types].xml` in DOCX    | ZIP error               | `CorruptDocumentExtractionException`       | `CORRUPT_DOCUMENT`                     | No         |
| Embedded VBA macro in DOCX               | Central directory check | `UnsupportedDocumentFeatureException`      | `UNSUPPORTED_FEATURE` (`VBA_MACROS`)   | No         |
| ZIP bomb ratio > 100:1 or size > 50 MB   | Ratio calculation       | `ExtractionResourceLimitExceededException` | `RESOURCE_LIMIT_EXCEEDED`              | No         |
| Zero meaningful text in document         | Empty text / whitespace | `EmptyExtractedDocumentException`          | `EMPTY_DOCUMENT`                       | No         |
| Embedded null bytes (`0x00`) in TXT / MD | Preflight sniffer       | `InvalidFormatExtractionException`         | `INVALID_FORMAT`                       | No         |
| Execution timeout (> 30s)                | Promise.race timeout    | `ExtractionTimeoutException`               | `TIMEOUT`                              | Yes        |
| Input buffer size > 10 MB                | Buffer length check     | `ExtractionResourceLimitExceededException` | `RESOURCE_LIMIT_EXCEEDED`              | No         |

---

## 5. Verification & Test Suite Summary

Pure unit test suites were implemented using synthetic, in-memory fixtures (no disk I/O, no network calls, zero external mocks):

| Test Suite                       | Spec File                                                                              |  Tests   |    Status     |
| :------------------------------- | :------------------------------------------------------------------------------------- | :------: | :-----------: |
| `PdfParserAdapter`               | `apps/api/src/ai/adapters/parsers/__tests__/pdf-parser.adapter.spec.ts`                |    10    |   **PASS**    |
| `DocxParserAdapter`              | `apps/api/src/ai/adapters/parsers/__tests__/docx-parser.adapter.spec.ts`               |    13    |   **PASS**    |
| `MarkdownParserAdapter`          | `apps/api/src/ai/adapters/parsers/__tests__/markdown-parser.adapter.spec.ts`           |    10    |   **PASS**    |
| `PlainTextParserAdapter`         | `apps/api/src/ai/adapters/parsers/__tests__/plain-text-parser.adapter.spec.ts`         |    10    |   **PASS**    |
| `CompositeDocumentParserAdapter` | `apps/api/src/ai/adapters/parsers/__tests__/composite-document-parser.adapter.spec.ts` |    13    |   **PASS**    |
| **Total Parser Tests**           |                                                                                        |  **56**  | **100% PASS** |
| **Monorepo Core Regression**     | `packages/core/src/**` (303 suites)                                                    | **4680** | **100% PASS** |
| **Monorepo Typecheck**           | `tsc --noEmit -p tsconfig.base.json`                                                   |    —     | **0 ERRORS**  |
