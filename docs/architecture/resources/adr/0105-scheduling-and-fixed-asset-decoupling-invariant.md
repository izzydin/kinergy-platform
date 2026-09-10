# ADR-0105: Scheduling and Fixed Asset Location Decoupling Invariant

- **Status**: Accepted
- **Deciders**: Principal Domain Architect, Lead Scheduling Architect, Security Architect
- **Date**: 2026-09-10
- **Context/Milestone**: Milestone 6.16 — Cross-Domain Integration Architecture

---

## 1. Context and Problem Statement

During Milestone 6.16, we evaluated whether Phase 3 Scheduling (Rooms and Appointments) should introduce direct relationships with Phase 6 Fixed Assets:

1. Does Kinergy need to model a database-level relationship between `Room` and `FixedAsset` (e.g. `Therapy Room ──> Equipment`, `Gym Area ──> Gym Equipment`)?
2. Does an asset being under maintenance (`AssetStatus.UNDER_MAINTENANCE`) require automatically locking out room reservations or cancelling appointments?
3. Should `Appointment` directly reference and reserve specific physical assets?

We must establish the precise architectural boundary distinguishing:

- **Asset Ownership**: "The business owns this equipment" (Fixed Asset domain).
- **Asset Location**: "This equipment is currently placed in Room 101 or Gym Floor" (Informational location tag).
- **Asset Scheduling**: "This specific piece of machinery is reserved on the calendar for a slot" (Scheduling domain).

---

## 2. Decision Drivers

- **Core Business Model**:
  - In Kinergy's clinical and gym operations, appointments book a **Space** (`Room`), a **Therapist**, and a **Client**.
  - Equipment is an amenity/fixture residing within spaces or facilities. Clients and practitioners do not book equipment items as distinct lines on calendar agendas.
- **Maintenance Decoupling**:
  - `Room` manages its own spatial availability and sanitation/maintenance schedules via `MaintenanceWindow` value objects per [ADR-0044](../../adr/0044-schedulable-resource-and-room-scheduling-architecture.md).
  - If a single physical asset (e.g., an ultrasound device) enters maintenance, the room itself remains operational for general therapy, consultations, or manual manipulation. Automatically blocking room bookings upon equipment failure would disrupt unaffected clinical appointments.
- **Portability & Relational Cleanliness**:
  - Forcing a foreign key `fixed_assets.room_id -> rooms.id` would make assets unassignable to common zones (e.g., "Main Cardio Floor", "Reception Lounge"), off-site calibration labs, or storage depots without creating synthetic "dummy rooms".
- **Domain Independence**:
  - Scheduling must not depend on Fixed Asset lifecycle state machines.
  - Fixed Assets must not depend on calendar conflict detection engines.

---

## 3. Decision Outcome

We establish the **Scheduling ↔ Fixed Asset Decoupling Policy**:

1. **LOCATION IS INFORMATIONAL, NOT RELATIONAL**:
   - `AssetLocation` remains an encapsulated Value Object: `{ facilityId: string, roomId?: string, zone?: string, description?: string }`.
   - The `roomId` property is a loose scalar identifier string. There is **NO foreign key constraint** between `fixed_assets` and `rooms` in the database.
2. **MAINTENANCE REMAINS DECOUPLED**:
   - Asset maintenance (`AssetStatus.UNDER_MAINTENANCE`, `AssetMaintenanceRecord`) does NOT cascade to mutate `Room.status` or generate `MaintenanceWindow` blockers in Scheduling.
   - Room closures remain strictly managed through `Room.scheduleMaintenanceWindow()`.
3. **EQUIPMENT IS NOT INDEPENDENTLY SCHEDULED**:
   - `Appointment` will NOT reference `assetId`.
   - The relationship `Appointment -> FixedAsset` is classified as **NOT REQUIRED NOW** (deferred until an explicit modality requires independent machine booking via a future `SchedulableResource` adapter).
4. **AUTOMATED BOUNDARY ENFORCEMENT**:
   - Automated tests in `packages/core/src/resources/resources-architecture-boundaries.spec.ts` enforce:
     - `Room` aggregate has zero imports or ownership of `FixedAsset`.
     - Zero relational fields between `Room` and `FixedAsset` in `prisma/schema.prisma`.

---

## 4. Consequences

### Positive

- **Flexibility**: Assets can be transferred to storage, repair, hallways, or outdoor areas without failing relational constraints.
- **Zero Cascading Side-Effects**: Asset maintenance logs and condition updates do not trigger accidental clinic booking outages or phantom appointment cancellations.
- **High Cohesion**: Room scheduling conflict evaluators remain fast, clean, and completely decoupled from asset accounting.

### Negative / Trade-offs

- The system does not prevent an appointment from being booked in a room whose ultrasound machine is broken. Operational assignment of specific equipment to rooms is managed through room feature tags (`features: ['ultrasound', 'massage_table']`), preserving clinical flexibility.
