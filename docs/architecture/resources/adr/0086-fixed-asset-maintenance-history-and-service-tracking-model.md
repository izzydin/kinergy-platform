# ADR-0086: Fixed Asset Maintenance History & Service Tracking Model

- **Status**: Accepted
- **Deciders**: Principal Architect, Lead Backend Engineer, Lead DevOps Engineer
- **Date**: 2026-08-25
- **Context/Milestone**: Phase 6 — Asset Maintenance Strategy

---

## Context and Problem Statement

High-value clinic machines (e.g. therapeutic lasers, shockwave therapy units, dynamometers) require regular servicing, preventive inspections, and calibration certifications to meet healthcare compliance and safety standards.

We must decide how maintenance history is modeled in Phase 6 without prematurely creating a bloated Computerized Maintenance Management System (CMMS).

---

## Decision Drivers

- **Compliance & Safety**: Complete historical log of who serviced the equipment, when, and at what cost.
- **Scope Defense**: Avoid building complex work order dispatch, technician shift scheduling, or spare part bill-of-materials in Phase 6.
- **Aggregate Encapsulation**: Maintenance history belongs to the specific physical asset.

---

## Decision Outcome

We model maintenance history as a dedicated child entity **`AssetMaintenanceRecord` owned by the `FixedAsset` aggregate root** and persisted in `asset_maintenance_records`.

1. **Entity Attributes**: `id`, `fixedAssetId`, `maintenanceType` (`PREVENTIVE_INSPECTION`, `REPAIR`, `CALIBRATION_CERTIFICATION`, `SAFETY_AUDIT`), `serviceDate`, `serviceProvider`, `serviceCost`, `description`, `nextScheduledDate`, `recordedByUserId`, `timestamp`.
2. **Append-Only Immutability**: Records are write-once.
3. **Preventive Reminder Support**: `nextScheduledDate` allows operational dashboard queries for upcoming servicing requirements without requiring complex scheduling engines.

---

## Alternatives Considered

1. **Simple Maintenance String on Asset (`lastServiceDate`, `nextServiceDate` only)**:
   - _Rejected_: Inadequate for healthcare audit compliance. Overwrites historical repair costs and vendor details.
2. **Dedicated Full Maintenance Bounded Context (CMMS)**:
   - _Rejected as premature_: Over-engineers Phase 6. Simple append-only records satisfy current business needs while remaining extensible for future work order systems via `workOrderId?: string`.

---

## Consequences

- **Positive**: Clean, audit-compliant maintenance logs with minimal architectural complexity.
- **Negative**: Work order ticketing and third-party contractor management remain manual operations.
