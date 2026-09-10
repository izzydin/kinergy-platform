# ADR-0103: Frontend Modal Interaction Hardening, Safe-by-Default Focus Policy, and Dismissal Invariants

**Status**: `ACCEPTED`  
**Date**: 2026-09-10  
**Deciders**: Principal Frontend Architect, Lead Interaction Engineer, Accessibility Specialist, Kinergy Architecture Review Board (ARB)  
**Subsystem**: Resources Management (`apps/web/src/modules/resources/`)  
**Related ADRs**:

- [ADR 0071: Frontend CRUD Experience Lifecycle and Composition Contract](../../../adr/0071-frontend-crud-experience-lifecycle-and-composition-contract.md)
- [ADR 0072: Frontend Optimistic UX Architecture and Decision Policy](../../../adr/0072-frontend-optimistic-ux-architecture-and-decision-policy.md)
- [ADR-0100: Frontend Resources Feature-Module Boundaries](./0100-frontend-resources-feature-module-boundaries.md)

---

## 1. Context and Problem Statement

Modal dialogs in the Resources Management domain (`Consumable Inventory` and `Fixed Assets`) execute both routine operational updates (receiving stock, logging maintenance, physical placement transfers) and high-consequence lifecycle actions (permanent asset retirement per invariant `[AST-INV-1]`, irreversible inventory scrapping, catalog archiving).

Without strict interaction engineering rules, dialogs frequently suffer from severe usability and safety failures:

1. **Accidental Deletion via Default Enter**: Dialogs that autofocus the destructive action button allow users to unintentionally trigger permanent actions by pressing `Enter`.
2. **Orphaned Mutation Requests**: When users press `Escape` or click outside a dialog during an active in-flight mutation, the dialog dismisses while the HTTP request continues in the background, leaving the client in an ambiguous, unconfirmed state.
3. **Catastrophic Unsaved Data Loss**: Closing a dirty modal form via accidental `Escape` or background click discards uncommitted data without warning.
4. **Disorientation on Modal Closure**: Without explicit focus restoration, closing a dialog drops keyboard focus to the document root, breaking keyboard workflows for assistive technology users.
5. **Color-Alone Destructive Cues**: Relying solely on red/destructive styling violates WCAG 2.1 AA Success Criterion 1.4.1 (Use of Color).

---

## 2. Decision & Architecture Invariants

We establish the **Kinergy Modal Interaction & Safe Focus Policy** across all Phase 6 dialogs:

### A. Initial Focus Policy: Safe-by-Default

Dialogs are classified into two deterministic categories with contrasting focus requirements:

| Dialog Classification        | Typical Use Cases                                                                                                                                                                                             | Initial Focus Target                                                                                 | Rationale                                                                                                                                               |
| :--------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :--------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Destructive Confirmation** | `RetireAssetDialog`, `ScrapStockDialog`, `ArchiveProductDialog`, `ConfirmDiscardDialog`                                                                                                                       | **Safe Cancel / Keep in Service Button** (`cancelButtonRef` or `cancelBtnRef`) via `onOpenAutoFocus` | Pressing `Enter` immediately upon dialog presentation executes the safe cancellation rather than irreversible destruction.                              |
| **Transactional Modal Form** | `ReceiveStockDialog`, `SellStockDialog`, `ConsumeStockDialog`, `AdjustStockDialog`, `TransferAssetLocationDialog`, `UpdateAssetConditionDialog`, `RecordAssetMaintenanceDialog`, `UpdateAssetValuationDialog` | **Primary Operative Input Control** (`initialInputRef`) via `onOpenAutoFocus`                        | Eliminates redundant `Tab` keystrokes and enables immediate keyboard input into the primary operative field (quantity, units, location, justification). |

### B. In-Flight Mutation Dismissal Suppression

While an asynchronous mutation is actively processing (`isPending === true`):

1. **Escape Key Suppression**: `onEscapeKeyDown={(e) => { if (isPending) e.preventDefault(); }}` prevents dialog closure.
2. **Outside Pointer Suppression**: `onPointerDownOutside={(e) => { if (isPending) e.preventDefault(); }}` prevents accidental dismissal by clicking the backdrop.
3. **Submit Button State**: Submit buttons are immediately disabled, displaying a loading spinner (`Loader2 className="animate-spin"`) and communicative gerund text (`Recording...`, `Retiring Asset...`, `Adjusting...`).

### C. Dirty Navigation Protection & Recoverable Error Preservation

1. **Dirty Form Guard**: Modal forms track `isDirty` via React Hook Form. Attempting to close a dirty dialog via `Escape` or Cancel intercepts dismissal and renders `ConfirmDiscardDialog`.
2. **Form State Preservation on Failure**: When a mutation fails with a recoverable server error, the dialog remains open, an inline alert displays the server error message, and all entered values and dirty state remain intact so the operator can correct values and retry without retyping.

### D. Focus Restoration

Modal dialogs receive `triggerRef?: React.RefObject<HTMLElement | null>` and implement `onCloseAutoFocus`. When the dialog closes, focus deterministically returns to the interactive element that initiated the workflow.

### E. Non-Color-Alone Destructive Semantics

Destructive actions (such as asset retirement or stock scrap) must reinforce risk through multiple sensory channels:

- Explicit invariant disclosure text (e.g. `Permanent & Irreversible Invariant [AST-INV-1]`).
- Warning iconography (`<AlertTriangle>`, `<ShieldAlert>`, `<Trash2>`).
- Plain-text consequence summaries outlining the exact business impact.

---

## 3. Verification & Compliance Evidence

- Automated interaction test suite: [`apps/web/src/modules/resources/__tests__/phase6-dialog-interactions.spec.tsx`](file:///c:/Projects/kinergy-platform/apps/web/src/modules/resources/__tests__/phase6-dialog-interactions.spec.tsx) (23 tests passing).
- Full frontend test suite pass rate: **100% (1,205 passing tests)**.

---

## 4. Consequences

### Positive

- Prevents catastrophic accidental data loss or irreversible hardware decommissioning.
- WCAG 2.1 AA compliant keyboard navigation and predictable focus cycles.
- Eliminates orphaned background network requests and ambiguous UI states.

### Negative / Trade-offs

- Requires passing `triggerRef` and managing `cancelButtonRef` across dialog implementations.
