# Kinergy Platform — MVP Demonstration User Acceptance Testing (UAT) Guide

**Document ID:** `DOC-UAT-011`  
**Milestone:** 11.2 — Professional MVP Demo Documentation  
**Version:** `1.0.0`  
**Status:** **ACTIVE & VERIFIED**  
**Document Ownership:** Product Delivery Lead, QA Lead, Business Stakeholder Representatives  
**Last Verified Date:** 2026-11-05  
**Companion Manuals:** [MVP Demo Guide](../development/mvp-demo-environment-guide.md), [Business Scenarios](demo-scenarios.md)

---

## 1. UAT Framework & Evaluation Purpose

This document provides formal User Acceptance Testing (UAT) verification criteria for commercial stakeholders, product owners, and clinical directors evaluating the **Kinergy Platform** MVP. It establishes deterministic pass/fail benchmarks across all four core business domains.

---

## 2. Domain Acceptance Criteria & Verification Matrices

### 2.1 Domain 1: Client Ingress & Profile Management

| Criterion ID   | Business Capability           | Evaluation Step                        | Acceptance Standard                                                                                  |  Result  |
| :------------- | :---------------------------- | :------------------------------------- | :--------------------------------------------------------------------------------------------------- | :------: |
| **UAT-CLI-01** | Client Intake Registration    | Register new client via `/clients/new` | Generates formatted reference (`CLI-YYYY-XXXXX`), persists normalized name/email/phone.              | [ ] PASS |
| **UAT-CLI-02** | Trigram Search Lookup         | Search partial name in `/clients`      | Sub-millisecond matching across first name, last name, and email via PostgreSQL `pg_trgm`.           | [ ] PASS |
| **UAT-CLI-03** | Append-Only Activity Timeline | View client profile `/clients/:id`     | Timeline lists intake, plan enrollments, check-ins, and appointments in reverse chronological order. | [ ] PASS |

---

### 2.2 Domain 2: Gym & Turnstile Attendance Management

| Criterion ID   | Business Capability         | Evaluation Step                                     | Acceptance Standard                                                                                           |  Result  |
| :------------- | :-------------------------- | :-------------------------------------------------- | :------------------------------------------------------------------------------------------------------------ | :------: |
| **UAT-GYM-01** | Membership Plan Catalog     | View plans list `/gym/plans`                        | Displays active tiers (Gold Annual, Silver Monthly, 10-Visit Pass) with integer cent prices and quota bounds. | [ ] PASS |
| **UAT-GYM-02** | Plan Agreement Enrollment   | Enroll client Carlos Rivera in plan                 | Immediate transition to `ACTIVE` status; start and end dates calculated correctly.                            | [ ] PASS |
| **UAT-GYM-03** | Overlapping Agreement Guard | Attempt enrolling active member into duplicate plan | System blocks concurrent active agreements for the same client with descriptive warning.                      | [ ] PASS |
| **UAT-GYM-04** | Turnstile Admission Grant   | Check in active member at `/gym/attendance`         | Displays green `GRANTED — Access Permitted` banner; logs gate ID and timestamp.                               | [ ] PASS |
| **UAT-GYM-05** | Anti-Passback Cooldown      | Immediately retry check-in for same member          | Displays `DENIED — Rapid Duplicate Check-In Cooldown Active` (5-minute security cooldown).                    | [ ] PASS |

---

### 2.3 Domain 3: Clinical Kinesiology & 4D Scheduling

| Criterion ID   | Business Capability           | Evaluation Step                               | Acceptance Standard                                                                                         |  Result  |
| :------------- | :---------------------------- | :-------------------------------------------- | :---------------------------------------------------------------------------------------------------------- | :------: |
| **UAT-KIN-01** | Calendar Grid Visualization   | View `/scheduling/calendar`                   | Facility rooms and therapist appointments rendered accurately in facility local timezone.                   | [ ] PASS |
| **UAT-KIN-02** | 4D Conflict Prevention        | Attempt overlapping booking in Room 1         | Scheduling engine catches collision (therapist, room, client, turnaround buffer) and returns 409 Conflict.  | [ ] PASS |
| **UAT-KIN-03** | Treatment Encounter Lifecycle | Click **Start Treatment Session**             | Encounter transitions to `IN_PROGRESS`; clinical charting workspace unlocks.                                | [ ] PASS |
| **UAT-KIN-04** | Structured SOAP Documentation | Enter Subjective, Objective, Assessment, Plan | Form auto-saves draft notes incrementally without data loss.                                                | [ ] PASS |
| **UAT-KIN-05** | Medico-Legal Locking          | Click **Complete Treatment Session**          | Session transitions to `COMPLETED` with locked badge; all notes become permanently read-only and immutable. | [ ] PASS |

---

### 2.4 Domain 4: Consumable Inventory & Retail POS

| Criterion ID   | Business Capability               | Evaluation Step                              | Acceptance Standard                                                                                        |  Result  |
| :------------- | :-------------------------------- | :------------------------------------------- | :--------------------------------------------------------------------------------------------------------- | :------: |
| **UAT-INV-01** | Inventory Catalog & Categories    | View `/resources/inventory`                  | Displays items across snacks, drinks, clinical supplies with decimal quantities and UOMs.                  | [ ] PASS |
| **UAT-INV-02** | Low-Stock Visual Triggers         | View `/resources/inventory/low-stock`        | Kinesiology Tape (3 rolls on hand vs 10 minimum) surfaces with red warning alert.                          | [ ] PASS |
| **UAT-INV-03** | Stock Receiving & Audit Trail     | Receive 15 rolls with invoice `INV-2026-991` | Quantity on hand increments to 18; low-stock alert clears; `PURCHASE` movement logged in ledger.           | [ ] PASS |
| **UAT-INV-04** | Retail POS Ring-up                | Add 2 Electrolyte Drinks to cart             | Order creates in `PENDING_PAYMENT` with price snapshot ($6.00 total). Inventory is not yet decremented.    | [ ] PASS |
| **UAT-INV-05** | Payment-Triggered Stock Decrement | Settle retail order via Cash                 | Upon payment settlement, inventory stock on hand decrements from 36 to 34 bottles; `SALE` movement logged. | [ ] PASS |

---

### 2.5 Domain 5: Commercial Sales, Payments & Fiscal Receipts

| Criterion ID   | Business Capability              | Evaluation Step                                | Acceptance Standard                                                                                         |  Result  |
| :------------- | :------------------------------- | :--------------------------------------------- | :---------------------------------------------------------------------------------------------------------- | :------: |
| **UAT-FIN-01** | Cross-Domain Order Sourcing      | Source order from Gym Membership / Kinesiology | Line item inherits source ID, description, and snapshot price; manual mutation prohibited.                  | [ ] PASS |
| **UAT-FIN-02** | Monetary Precision & Checks      | Inspect financial totals                       | Exact integer cent arithmetic; PostgreSQL CHECK constraints enforce total = subtotal - discounts.           | [ ] PASS |
| **UAT-FIN-03** | Split Tender Handling            | Pay $8.50 order with $3.50 Cash + $5.00 QR     | Order updates to `PARTIALLY_PAID` with remaining balance $5.00; accepts second tender.                      | [ ] PASS |
| **UAT-FIN-04** | QR Payment Pending Safeguard     | Record QR tender in POS                        | QR payment is created in `PENDING` status; does not automatically settle order without verification.        | [ ] PASS |
| **UAT-FIN-05** | Authoritative Payment Settlement | Open `/payments/:id` $\to$ **Settle Payment**  | `SettlePaymentDialog` confirms financial breakdown; confirms external bank code; marks payment `COMPLETED`. | [ ] PASS |
| **UAT-FIN-06** | Sequential Fiscal Receipt        | Click **View Receipt**                         | Generates official fiscal voucher (`REC-YYYY-XXXXX`); printable/downloadable format.                        | [ ] PASS |

---

## 3. Formal UAT Stakeholder Sign-Off Matrix

```
================================================================================
                    KINERGY PLATFORM MVP DEMONSTRATION UAT SIGN-OFF
================================================================================

Target Release Version:      MVP 1.0 (Milestone 11.2)
Evaluation Environment:      Controlled Demo (PostgreSQL 16 / Port 5433)
Total Test Criteria:         23 Criteria Across 5 Domains

Domain 1: Client Ingress:            [ ] ACCEPTED    [ ] REJECTED    [ ] CONDITIONAL
Domain 2: Gym & Turnstiles:          [ ] ACCEPTED    [ ] REJECTED    [ ] CONDITIONAL
Domain 3: Clinical Kinesiology:      [ ] ACCEPTED    [ ] REJECTED    [ ] CONDITIONAL
Domain 4: Inventory & Retail POS:    [ ] ACCEPTED    [ ] REJECTED    [ ] CONDITIONAL
Domain 5: Financials & Receipts:     [ ] ACCEPTED    [ ] REJECTED    [ ] CONDITIONAL

--------------------------------------------------------------------------------
Overall Acceptance Verdict:          [ ] ACCEPTED FOR MVP DEMONSTRATION
                                     [ ] CHANGES REQUIRED BEFORE DEMONSTRATION
--------------------------------------------------------------------------------

Product Delivery Lead Signature:     ____________________________  Date: _______
Clinical Representative Signature:   ____________________________  Date: _______
Commercial / POS Lead Signature:     ____________________________  Date: _______
Platform Architecture Signature:     ____________________________  Date: _______
================================================================================
```
