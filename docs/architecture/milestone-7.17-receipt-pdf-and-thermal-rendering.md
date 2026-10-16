# Milestone 7.17: Receipt PDF and Thermal Rendering Architecture Specification

- **Status**: Proposed / Future Milestone Specification
- **Milestone**: 7.17 (Phase 7: Commercial Sales, Payments & Receipts)
- **Bounded Context**: Sales & Payments (`apps/api`, `packages/core`, and presentation rendering layer)
- **Author**: Technical Product Architect & Principal Systems Engineer
- **Date**: 2026-10-16
- **Governing ADRs**:
  - [ADR-0108: Deterministic Financial Representation and Currency Modeling](../adr/0108-money-representation.md)
  - [ADR-0111: Sales & Payments Authorization, Organization Isolation, and Audit Boundaries](../adr/0111-sales-payments-authorization-and-audit.md)
  - [ADR-0114: Canonical Monetary Policy, Deterministic Arithmetic, and Sale Totals](../adr/0114-canonical-monetary-policy-and-sale-totals.md)
  - [ADR-0117: Receipt Domain Boundary, Document Model, and Legal Proof-of-Purchase Invariants](../adr/0117-receipt-domain-boundary-and-document-model.md)
  - [ADR-0118: Sale Reference and Receipt Identification Strategy](../adr/0118-sale-reference-and-receipt-identification-strategy.md)
  - [ADR-0135: Sales, Payments & Receipts Authorization Architecture, IAM Integration & Security Boundaries](../adr/0135-sales-payments-receipts-authorization-and-security.md)
- **Predecessor Dependencies**:
  - Milestone 7.7 (Receipt Domain Aggregate & Sequential Voucher Numbering)
  - Milestone 7.16 (Receipt API & Canonical `ReceiptResponseDto` Contract)

---

## 1. Executive Summary & Objective

The objective of **Milestone 7.17** is to provide rendering capabilities for customer-facing proof-of-purchase documents. The milestone will render an **already issued, immutable `Receipt`** into two distinct output formats:

1. **Printable / Downloadable PDF Document**: An A4 / US-Letter vector document formatted for customer email dispatch, desktop viewing, and legal archival.
2. **Thermal Receipt Stream / Buffer**: An ESC/POS text-and-control-code byte stream (or text-grid template) formatted for point-of-sale thermal receipt printers (standard 80mm and 58mm roll widths).

### Critical Scope Boundaries & Negative Requirements

- **Strictly Consumes Established Representations**: Rendering must consume the stable `ReceiptResponseDto` (or an application-level DTO derived from the domain `Receipt` aggregate). It **never** queries the raw database directly or executes ad-hoc database joins.
- **Zero Recalculation**: Rendering must **never** recalculate prices, subtotals, taxes, or discounts using current product catalog or client tables. It must faithfully format the frozen snapshot data.
- **Pure Presentation Isolation**: Rendering logic belongs to presentation / infrastructure adapters. The core financial domain (`packages/core/src/sales/domain`) must remain 100% agnostic of PDF layout engines, thermal byte sequences, font metrics, and paper widths.
- **Zero Mutating Side Effects**: Rendering a document does **not** update `reprintCount`, modify `lastReprintedAt`, or change Sale or Payment state. (Reprint auditing is strictly deferred to Milestone 7.18).
- **No Premature Library Coupling**: Concrete rendering libraries (e.g., PDFKit, Puppeteer, React-PDF, or ESC/POS encoders) must not be coupled to application use cases; rendering must be exposed behind an interface port (e.g. `IReceiptRendererPort`).

---

## 2. Intended Scope & Acceptance Criteria

### 2.1 PDF Document Rendering

- [ ] **Visual Hierarchy & Layout**: Formats header (facility branding, address, tax ID/reference), document metadata (`receiptNumber`, `issuedAt` ISO 8601 formatted, `saleReference`), client snapshot, tabular line items, monetary summary, and payment tender breakdown.
- [ ] **Document Metadata**: Sets PDF document properties (Title: `Receipt <receiptNumber>`, Author: `Kinergy Platform`, CreationDate: `issuedAt`).
- [ ] **Reprint Watermark**: If `receipt.reprintCount > 0`, the PDF must display a prominent, unambiguous visual watermark or header label: `COPY / DUPLICATE - REPRINT #<count>`.

### 2.2 Thermal Receipt Formatting (80mm & 58mm Widths)

- [ ] **Character Grid Alignment**: Formats fixed-pitch character layouts:
  - **80mm standard paper**: 42 or 48 monospace characters per line.
  - **58mm compact paper**: 32 monospace characters per line.
- [ ] **Deterministic Column Spacing**: Fixed columnar alignment for item quantity, description, unit price, and line total without horizontal clipping.
- [ ] **Control Code Abstraction**: Separates plain formatted ASCII/UTF-8 text preview from ESC/POS binary command sequences (paper cut `GS V`, bold text `ESC E`, centering `ESC a`).

### 2.3 Snapshot & Financial Data Fidelity

- [ ] **Monetary Formatting**: Consumes structured `MoneyResponseDto` (`formatted`, `currency`, integer `cents`). Does **not** perform IEEE 754 floating-point divisions during rendering.
- [ ] **Deterministic Item Order**: Respects `lineNumber ASC` ordering established in Milestone 7.16 to guarantee deterministic document generation.
- [ ] **Client Snapshot Handling**: Correctly formats registered client profiles (`fullName`, `referenceNumber`, `email`, `phone`). Correctly renders anonymous walk-in purchases (`clientSnapshot: null`) displaying `Customer: Walk-in / Cash Guest`.
- [ ] **Tender Multiplicity**: Accurately formats multi-tender split payments (e.g., `$40.00 CASH` + `$60.00 CARD = $100.00 TOTAL`).

### 2.4 Typography, Unicode & Layout Overflow Defense

- [ ] **Long Text Wrapping**: Automatically wraps product descriptions exceeding column width without breaking adjacent numerical price columns.
- [ ] **Unicode & Diacritics**: Supports international client names, accented characters (Spanish/French diacritics), and currency symbols (`$`, `€`, `£`) without garbled glyphs or byte corruption.
- [ ] **Multi-Page Pagination**: For long orders ($> 20$ items), the PDF layout must paginate cleanly with repeating column headers, page numbers (`Page X of Y`), and totals reserved for the final page.

### 2.5 Error Handling & Security Boundaries

- [ ] **Missing Receipt Handling**: If a client requests rendering for a non-existent receipt or unissued sale, the endpoint returns standard `404 Not Found` with the existing error contract. Zero blank or corrupt files generated.
- [ ] **Rendering Failure Isolation**: If rendering encounters a font or template failure, the system returns `500 Internal Server Error` with a sanitized error envelope and correlation ID; zero stack traces or internal filesystem paths exposed.
- [ ] **Authorization & Tenant Isolation**: Rendering endpoints require `receipts.read` permission and enforce the identical multi-tenant and BOLA ownership boundaries established in Milestone 7.16. Unauthenticated requests receive `401`; unauthorized callers receive `403`.
- [ ] **Safe File Transmission**: PDF endpoints must return `Content-Type: application/pdf` with `Content-Disposition: inline; filename="receipt-<receiptNumber>.pdf"` and standard security headers (`X-Content-Type-Options: nosniff`).

---

## 3. Synchronous vs. Asynchronous Rendering Architecture

Based on platform requirements, rendering execution is specified as follows:

| Format                                     | Execution Mode                    | Target Latency | Transport Strategy                                                                                                                      |
| :----------------------------------------- | :-------------------------------- | :------------: | :-------------------------------------------------------------------------------------------------------------------------------------- |
| **Thermal Stream (80mm/58mm)**             | **Synchronous**                   |   $< 25$ ms    | Streamed directly as formatted text or ESC/POS binary buffer via HTTP response.                                                         |
| **Standard PDF (< 15 items)**              | **Synchronous (On-the-fly)**      |   $< 150$ ms   | Rendered in-memory and streamed directly via `StreamableFile` without intermediate disk storage.                                        |
| **Bulk / Archival Export (> 50 receipts)** | **Asynchronous (Background Job)** |      N/A       | Offloaded to background job worker producing pre-signed S3/Blob storage download links. _(Deferred to Enterprise Reporting milestone)_. |

---

## 4. Required Architectural Decisions (To be decided in 7.17)

Before implementation commences in Milestone 7.17, the following ADR must be authored and accepted:

1. **ADR-0139: Receipt Presentation Rendering Architecture, Template Strategy, and Output Pipeline**:
   - Evaluate headless template engines vs programmatic vector builders (e.g. lightweight streaming PDF generator vs HTML-to-PDF).
   - Standardize ESC/POS code generation abstraction for network receipt printers.
   - Define exact printer column width profiles (42 vs 48 columns).
