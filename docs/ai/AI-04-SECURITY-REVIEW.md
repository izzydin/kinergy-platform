# AI-04: Security Review & RAG Threat Analysis

## 1. Security Architecture & Threat Model

The document ingestion and chunking pipeline operates within a multi-tenant clinical/medical and fitness platform. Documents contain highly sensitive patient health data, clinical evaluations, and proprietary operational procedures.

The security model of Milestone **AI-04** mitigates four primary threat vectors:

1. **Denial of Service (DoS) & Resource Exhaustion:** Malicious, oversized, or pathological documents (e.g. zip bombs, infinite PDF stream loops).
2. **Untrusted Code Execution & XSS Injection:** Malicious payloads embedded within Markdown, DOCX macros, or script blocks.
3. **Data Bleed & Cross-Tenant Access:** Ingestion of documents or retrieval of chunks across tenant boundaries.
4. **PHI/PII Log Leaks:** Accidental logging of clinical text, patient notes, or chunk contents to monitoring systems.

---

## 2. Threat Vector Mitigations & Verification

### 2.1 Denial of Service & Resource Limits

| Threat                            | Vulnerability Mechanism                             | Implemented Defense                                                                                                                                                | Verification                                                                                                |
| :-------------------------------- | :-------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------- |
| **Oversized Payloads**            | Buffer overflow, memory exhaustion                  | Strict 10 MB preflight limit across all format adapters.                                                                                                           | Verified in unit tests: payloads $> 10\text{ MB}$ rejected with `ExtractionResourceLimitExceededException`. |
| **Zip Bomb (Decompression Bomb)** | Small ZIP expanding to gigabytes                    | `DocxParserAdapter` inspects Central Directory headers before extraction. Rejects archives with $> 20\text{ MB}$ uncompressed or $> 10\text{x}$ compression ratio. | Verified in `docx-parser.adapter.spec.ts` using synthetic high-ratio zip archives.                          |
| **Pathological PDF Streams**      | Infinite xref loops or nested streams               | `PdfParserAdapter` enforces 500-page limit and wraps all parsing operations in a 30-second `Promise.race` timeout.                                                 | Verified in `pdf-parser.adapter.spec.ts`.                                                                   |
| **Giant Sentences**               | Single sentences $> 500$ tokens without punctuation | `StructureAwareChunkerService` applies token-level subdivision fallback to prevent unbounded memory allocation.                                                    | Verified in `chunking-quality-evaluation.spec.ts`.                                                          |

### 2.2 Untrusted Code Execution & Sanitization

- **No Subprocess Spawning:** No parsers spawn external operating system processes (e.g. `pdftotext`, `pandoc`, Python scripts). All parsing is executed in-process in managed JavaScript/TypeScript memory.
- **Markdown Lexer Isolation:** `MarkdownParserAdapter` uses `marked.lexer` to build an abstract syntax tree of tokens. It **never** renders tokens into an active HTML DOM or executes embedded JavaScript.
- **HTML & Script Tag Stripping:** Any `<script>`, `<iframe>`, or HTML event attributes (`onload`, `onerror`) present in Markdown documents are stripped during token sanitization.
- **DOCX Macro Invalidation:** Only `word/document.xml` body streams are extracted; `.bin` VBA macro streams are ignored and never executed.
- **Binary Disguise Protection:** `PlainTextParserAdapter` and `MarkdownParserAdapter` scan byte sequences for `0x00` null bytes, immediately rejecting binary files disguised as text.

### 2.3 Multi-Tenant Isolation & Storage Security

- **Compound Tenant Scoping:** Every database query in `PrismaKnowledgeDocumentRepository`, `PrismaIngestionJobRepository`, and `PrismaKnowledgeChunkRepository` enforces compound primary or index filters:
  ```typescript
  where: {
    (tenantId, documentId, documentVersionId);
  }
  ```
- **Storage Partitioning:** Object storage keys are partitioned deterministically:
  ```
  tenants/{tenantId}/knowledge_base/{year}/{month}/{uuid}.{ext}
  ```
  Tenant A cannot access or reference storage objects belonging to Tenant B.
- **Source Immutability:** On parser failure, timeout, or cancellation, source documents and versions are **never** mutated or deleted.

### 2.4 Clinical Privacy & Log Sanitization

In strict accordance with HIPAA and clinical privacy mandates:

- **Zero Document Text in Logs:** Document bodies, paragraphs, tables, code blocks, and chunk texts are strictly barred from `Logger` invocations.
- **Structured Metrics Only:** Application logs record only operational metadata:
  - Document ID and Version Number
  - Pipeline duration (ms)
  - Chunk count and total token count
  - Detected language code (`es`, `en`)
  - Cryptographic processing fingerprint (SHA-256 hash)

```json
{
  "documentId": "doc-clinical-001",
  "versionNumber": 1,
  "durationMs": 34,
  "chunkCount": 8,
  "totalTokens": 3420,
  "detectedLanguage": "es",
  "fingerprint": "8f3b...e10a"
}
```

---

## 3. Security Audit Verdict

The security boundaries of Milestone **AI-04** are verified as robust, defense-in-depth compliant, and production-ready for clinical data processing.
