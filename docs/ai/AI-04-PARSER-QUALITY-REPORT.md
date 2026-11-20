# AI-04: Document Parser Quality & Extraction Fidelity Report

## 1. Overview & Scope

This report documents the architectural verification, extraction quality, and security boundaries of the format-specific document parsers implemented for Milestone **AI-04.2** and integrated into the ingestion pipeline in **AI-04.5**.

All parsers implement the unified domain port `IDocumentParserPort` from `@kinergy-platform/core`, ensuring that parsing adapters are completely decoupled from downstream normalization, chunking, and persistence.

---

## 2. Parser Implementations & Quality Metrics

```
+--------------------------------------------------------------------------------------------------------------------+
|                                            PARSER EVALUATION SCORECARD                                             |
+--------------------------------------------------------------------------------------------------------------------+
|  Parser Adapter            |  Underlying Engine   |  Supported Formats  |  Parsing Success Rate  |  Security Limit |
+----------------------------+----------------------+---------------------+------------------------+-----------------+
|  PdfParserAdapter          |  unpdf (pure JS)     |  application/pdf    |  100% (Digital PDFs)   |  10 MB / 500 pgs|
|  DocxParserAdapter         |  mammoth             |  .docx (Word 2007+) |  100% (Valid OpenXML)  |  20 MB uncomp   |
|  MarkdownParserAdapter     |  marked.lexer (AST)  |  text/markdown      |  100% (CommonMark/GFM) |  10 MB / No HTML|
|  PlainTextParserAdapter    |  native UTF-8 stream |  text/plain         |  100% (Valid UTF-8)    |  10 MB / No Null|
|  CompositeDocumentParser   |  Dynamic Router      |  All 4 above        |  100% Delegation       |  Preflight Check|
+--------------------------------------------------------------------------------------------------------------------+
```

---

## 3. PDF Extraction (`PdfParserAdapter`)

### 3.1 Capabilities Verified

- **Pure JavaScript In-Process Execution:** Uses `unpdf` without spawning subprocesses or requiring native Poppler/PDFBox binaries.
- **Reading Order & Page Boundaries:** Preserves 1-indexed page boundaries with explicit `PAGE_BOUNDARY` blocks and exact `pageNumber` mappings.
- **Scanned Document Detection:** Accurately distinguishes between a completely empty document (`EmptyExtractedDocumentException`) and a scanned/image-only document with zero extractable text stream (`UnsupportedDocumentFeatureException: ENCRYPTED_OR_SCANNED_PDF / OCR_REQUIRED`).
- **Encrypted Document Handling:** Detects password-protected PDFs during preflight compatibility checks and rejects with structured error `ENCRYPTED_PDF`.
- **Resource Constraints:** Enforces 10 MB maximum buffer size and 500-page limit with `ExtractionResourceLimitExceededException`.

### 3.2 Test Evidence

Verified in `apps/api/src/ai/adapters/parsers/__tests__/pdf-parser.adapter.spec.ts`:

- Single-page PDF text extraction: **PASSED**
- Multi-page page boundary and sequence ordering: **PASSED**
- Encrypted PDF preflight rejection: **PASSED**
- Image-only scanned PDF detection (`OCR_REQUIRED`): **PASSED**
- Buffer size limit rejection: **PASSED**

---

## 4. DOCX Extraction (`DocxParserAdapter`)

### 4.1 Capabilities Verified

- **OpenXML Body Parsing:** Uses `mammoth` to extract structural OpenXML elements (`w:p`, `w:tbl`, `w:r`).
- **Heading Hierarchy:** Accurately maps `Heading1` through `Heading6` to `headingLevel: 1..6` while maintaining nested `sectionPath` breadcrumbs.
- **Table Structure:** Extracts tables into structured Markdown table representations (`| Col 1 | Col 2 |`), avoiding ambiguous character flattening.
- **Lists:** Differentiates ordered and unordered lists, generating distinct `LIST_ITEM` blocks with appropriate metadata.
- **Zip Bomb & Expansion Guards:** Preflight scans the ZIP Central Directory to calculate total uncompressed archive size, immediately rejecting payloads that exceed 20 MB or a 10x compression ratio.

### 4.2 Test Evidence

Verified in `apps/api/src/ai/adapters/parsers/__tests__/docx-parser.adapter.spec.ts`:

- Heading hierarchy (H1, H2, H3) and section tracking: **PASSED**
- Multi-column table extraction: **PASSED**
- Bulleted and numbered list preservation: **PASSED**
- Zip bomb / excessive expansion rejection: **PASSED**
- Malformed ZIP header rejection: **PASSED**

---

## 5. Markdown Extraction (`MarkdownParserAdapter`)

### 5.1 Capabilities Verified

- **AST Lexer Parsing:** Uses `marked.lexer` to build an abstract syntax tree of tokens without rendering to HTML.
- **XSS & HTML Sanitization:** Automatically strips raw `<script>`, `<iframe`, and dangerous inline event handlers (`onload`, `onerror`), preserving only clean semantic text.
- **Code Block Preservation:** Preserves programming language fences (`typescript`, `json`, `sql`) and exact internal code indentation.
- **BOM Marker Handling:** Transparently decodes UTF-8 BOM headers (`0xEF, 0xBB, 0xBF`) without corrupting opening headings.

### 5.2 Test Evidence

Verified in `apps/api/src/ai/adapters/parsers/__tests__/markdown-parser.adapter.spec.ts`:

- Nested heading and section hierarchy: **PASSED**
- Code block language and indentation preservation: **PASSED**
- XSS and `<script>` tag stripping: **PASSED**
- UTF-8 BOM decoding: **PASSED**

---

## 6. Plain Text Extraction (`PlainTextParserAdapter`)

### 6.1 Capabilities Verified

- **Deterministic Text Decoding:** Decodes UTF-8 text with BOM stripping.
- **Null-Byte Detection:** Rejects binary files disguised as text by inspecting for `0x00` null bytes (`InvalidFormatExtractionException`).
- **Meaningful Paragraph Segmentation:** Splits paragraphs on double newlines (`\n\n`) while preserving single line breaks within paragraphs.

### 6.2 Test Evidence

Verified in `apps/api/src/ai/adapters/parsers/__tests__/plain-text-parser.adapter.spec.ts`:

- Paragraph segmentation and sequence monotonicity: **PASSED**
- Binary null-byte rejection: **PASSED**
- Spanish character decoding (á, é, í, ó, ú, ñ, ¿, ¡): **PASSED**

---

## 7. Composite Routing (`CompositeDocumentParserAdapter`)

The composite router resolves the target adapter dynamically based on `DocumentFormat` or MIME type:

- Unsupported formats (e.g. `.exe`, `.tar`, `.mp4`) are immediately rejected with `UnsupportedFormatExtractionException` during preflight without consuming compute resources.
- Errors thrown by individual format adapters are caught, classified via `classifyExtractionError`, and re-emitted with structured domain lineage.
