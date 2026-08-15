# Kinesiology Bounded Context — Domain Ownership, Vocabulary & Architectural Boundaries

## 1. Executive Summary

This document establishes the formal domain ownership boundaries, canonical ubiquitous vocabulary, and cross-context relationship rules for the **Kinesiology Bounded Context** within the Kinergy modular monolith platform. It defines the explicit separation of responsibilities between **Identity**, **Client Management**, **Scheduling**, and **Kinesiology**, eliminating conceptual ambiguity, preventing aggregate coupling, and forbidding cross-context distributed transactions.

---

## 2. Core Architectural Principle

> **Fundamental Context Rule**:
> Each bounded context owns its own domain concepts and invariants. Other contexts may reference those concepts via opaque identifiers, but they do not own, mutate, or duplicate foreign aggregates.

---

## 3. Ubiquitous Language & Canonical Vocabulary

To prevent terminology drift, the following definitions form the authoritative Ubiquitous Language for the Kinesiology Bounded Context:

| Canonical Term              | Conceptual Definition & Scope                                                                                                                         | Owner Bounded Context              | Prohibited Synonyms / Rejected Aliases                                                     |
| :-------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------- | :----------------------------------------------------------------------------------------- |
| **`TreatmentSession`**      | The root entity and clinical record of a single therapeutic kinesiology encounter. Encapsulates status, notes, interventions, and clinical findings.  | **Kinesiology**                    | ❌ `Treatment`, `TreatmentRecord`, `PatientTreatment`, `TherapySession`, `ClinicalSession` |
| **`SessionStatus`**         | The clinical lifecycle state machine of a `TreatmentSession` (`SCHEDULED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `NO_SHOW`).                       | **Kinesiology**                    | ❌ `TreatmentStatus`, `TreatmentState`, `ClinicalStatus`, `AppointmentTreatmentStatus`     |
| **`SessionNotes`**          | The clinical notes and therapeutic observations documented during or after a session (e.g. SOAP structure).                                           | **Kinesiology**                    | ❌ `ClinicalNotes`, `TreatmentNotes`, `TherapyNotes`, `MedicalNotes`                       |
| **`Therapist`**             | The clinical practitioner conducting and authoring the treatment session. Modeled via `therapistId: string` matching a `User.id` with therapist role. | **Identity / Cross-Cutting**       | ❌ `Provider`, `Practitioner`, `Clinician`, `TherapistUser`                                |
| **`Client`**                | The registered individual receiving care. Authoritative aggregate in Client Management, referenced in Kinesiology via `clientId: string`.             | **Client Management**              | ❌ `Patient`, `PatientAggregate`, `PatientProfile`, `KinesiologyClient`, `Customer`        |
| **`Treatment History`**     | The longitudinal historical progression and past record of treatment sessions for a specific client.                                                  | **Kinesiology (Read Model)**       | ❌ `PatientHistory`, `MedicalRecord`, `ClinicalHistory`                                    |
| **`Patient Timeline`**      | A client-centric UI/business visualization projecting clinical milestones alongside scheduling/billing events.                                        | **Client Management / Read Model** | ❌ `PatientStream`, `CareTimeline`                                                         |
| **`Appointment Reference`** | The conceptual correlation between a clinical session and a logistical calendar booking.                                                              | **Scheduling Relationship**        | ❌ `AppointmentLink`, `BookingConnection`                                                  |
| **`Appointment`**           | The logistical calendar reservation of a room, therapist shift, and time slot.                                                                        | **Scheduling**                     | ❌ `TreatmentAppointment`, `TherapyAppointment`, `KinesiologyAppointment`                  |

---

## 4. Concept Distinctions & Boundary Clarifications

### 1. `Client` vs `Patient`

- **Domain Rule**: **`Client` is the single, authoritative ubiquitous domain concept**.
- "Patient" is merely a colloquial clinical role of a `Client` in conversational healthcare settings.
- Under no circumstances will a `Patient`, `PatientProfile`, or `PatientAggregate` be created in the domain or database schema.

### 2. `TreatmentSession` vs `Appointment`

- An **`Appointment`** (Scheduling) represents a logistical calendar event (reserving a room, therapist shift, and time slot).
- A **`TreatmentSession`** (Kinesiology) represents a clinical encounter (recording assessments, muscle testing, SOAP notes, and clinical outcomes).
- An appointment may exist without a treatment session (e.g. cancelled/no-show appointments or facility rentals).
- A treatment session may be linked to an appointment via `appointmentId: string?` (or created independently for walk-in clinical care).
- _Note on `AppointmentTypeEnum.TREATMENT`_: In Scheduling, `TREATMENT` is an administrative service category label (alongside `ASSESSMENT`, `RENTAL`, `GROUP_CLASS`). It is purely logistical and distinct from the `TreatmentSession` aggregate root.

### 3. `Appointment` vs `Appointment Reference`

- "Appointment Reference" is a business descriptor for the relationship between a session and an appointment.
- The actual technical domain identifier is always `appointmentId: string`. No intermediate `AppointmentReference` entity or `AppointmentReferenceId` type shall be introduced.

---

## 5. Canonical Identifiers

All cross-context domain interactions utilize standardized scalar or value-object identifiers:

```text
TreatmentSession
 ├── id: SessionId                  ◄── Local Aggregate ID (Value Object)
 ├── clientId: string               ◄── External Reference to Client Management (UUID)
 ├── therapistId: string            ◄── External Reference to Identity (User UUID)
 └── appointmentId?: string         ◄── Optional External Correlation to Scheduling (UUID)
```

| Canonical Identifier | Scope & Meaning                                            | Permitted Usages                                 | Prohibited Aliases                                   |
| :------------------- | :--------------------------------------------------------- | :----------------------------------------------- | :--------------------------------------------------- |
| **`SessionId`**      | Unique identifier for a Kinesiology Treatment Session.     | Domain value object / aggregate root ID.         | ❌ `TreatmentSessionId`, `KinesiologySessionId`      |
| **`ClientId`**       | Authoritative identifier for a registered Client.          | External correlation ID in `TreatmentSession`.   | ❌ `PatientId`, `SubjectId`, `CustomerRef`           |
| **`TherapistId`**    | Authoritative identifier for clinical practitioner (User). | Author / signer reference in `TreatmentSession`. | ❌ `ProviderId`, `PractitionerId`, `TherapistUserId` |
| **`AppointmentId`**  | Optional correlation ID to a calendar Appointment.         | Logistical correlation in `TreatmentSession`.    | ❌ `BookingId`, `AppointmentReferenceId`, `SlotId`   |

---

## 6. Prohibition of Aggregate & Model Coupling

To ensure maintainability, testability, and database scalability within the modular monolith:

### Strict Structural Rules

1. **Zero Foreign Aggregate Nesting**: `TreatmentSession` must **NEVER** import or embed `Client`, `Appointment`, `User`, or `Room` aggregates.
   ```typescript
   // ❌ STRICTLY PROHIBITED (Aggregate Coupling)
   export class TreatmentSession extends AggregateRoot {
     private _client: Client; // VIOLATION: Never embed foreign aggregate
     private _appointment: Appointment; // VIOLATION: Never embed foreign aggregate
   }

   // ✅ REQUIRED ARCHITECTURE (Identifier Referencing)
   export class TreatmentSession extends AggregateRoot<SessionId> {
     private readonly _clientId: string;
     private readonly _therapistId: string;
     private readonly _appointmentId?: string;
   }
   ```
2. **Zero Foreign Invariant Enforcement**:
   - Kinesiology must **not** check whether a client is in active billing status or whether a room is double-booked.
   - Client Management enforces Client invariants; Scheduling enforces Room/Appointment invariants.

---

## 7. Consistency Boundaries & Transaction Isolation

```text
┌───────────────────────────┐      ┌───────────────────────────┐
│     Client Management     │      │        Scheduling         │
│  Owns Client Consistency  │      │Owns Appointment Consist.  │
└───────────────────────────┘      └───────────────────────────┘
              ▲                                  ▲
              │ (Zero Distributed Tx)            │ (Zero Distributed Tx)
┌─────────────┴─────────────┐      ┌─────────────┴─────────────┐
│         Identity          │      │        Kinesiology        │
│  Owns Identity Consist.   │      │Owns TreatmentSess. Consist│
└───────────────────────────┘      └───────────────────────────┘
```

1. **Transaction Isolation**:
   - A `TreatmentSession` transaction operates strictly on Kinesiology persistence models.
   - **Zero Distributed Transactions**: Creating or updating a `TreatmentSession` must NEVER participate in a distributed two-phase commit ($2\text{PC}$) or cross-context database transaction with Client Management, Scheduling, or Identity.
2. **Optimistic Locking**:
   - `TreatmentSession` aggregates enforce their own `version: number` optimistic concurrency control. Concurrent note edits return an optimistic locking conflict without touching foreign aggregates.

---

## 8. Cross-Context Integration Strategy

Kinesiology integrates with external bounded contexts via two clean patterns:

1. **Domain-Level Opaque Identifier Referencing**:
   - Clinical sessions correlate with clients, practitioners, and calendar appointments purely through immutable string IDs.
2. **Application-Level Event Publishing (Asynchronous Projection)**:
   - When a treatment session reaches terminal `COMPLETED` status, the aggregate records `TreatmentSessionCompletedEvent`.
   - An application-layer event handler can invoke the Client Management timeline port to append a structured `ClientTimelineEntry` (sourceModule: `'KINESIOLOGY'`, eventType: `'TREATMENT_SESSION_COMPLETED'`) asynchronously.
   - Client Management receives only high-level summary metadata without importing Kinesiology domain rules.

---

## 9. Prohibited Anti-Patterns Summary

```text
❌ ANTI-PATTERN: Creating "Patient" or "PatientProfile" aggregates in Kinesiology
❌ ANTI-PATTERN: Embedding TreatmentSession inside Appointment aggregate or vice versa
❌ ANTI-PATTERN: Direct SQL joins across bounded context table schemas
❌ ANTI-PATTERN: Synchronous aggregate loading across context boundaries in domain layer
❌ ANTI-PATTERN: Distributed transactions spanning Kinesiology and Scheduling
❌ ANTI-PATTERN: Aliasing SessionId as TreatmentSessionId or TherapistId as ProviderId
```

---

## 10. Out of Scope & Deliberately Deferred Scope

To protect architectural focus during Milestone 4.1:

1. **Third-Party EHR / FHIR Interoperability**: Direct HL7/FHIR export connectors are deferred to future integration phases.
2. **Real-Time Telehealth Video**: Telemedicine streaming channels and WebRTC media servers are out of scope.
3. **Multi-Practitioner Simultaneous WebSocket Collaboration**: Real-time collaborative concurrent note editing via Operational Transformation (OT) or CRDTs is out of scope; optimistic concurrency locking is the chosen model.
4. **Billing & Insurance Claims Processing**: Generating financial invoices, insurance coding (CPT/ICD), or payment collection is owned by the future Billing context.
5. **Direct Client Self-Documentation**: Client self-assessment intake forms are owned by Client Management self-service modules; Kinesiology governs practitioner clinical records.
