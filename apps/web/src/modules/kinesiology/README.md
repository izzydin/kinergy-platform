# Kinesiology Frontend Module (`apps/web/src/modules/kinesiology`)

## 1. Overview & Architectural Scope

The **Kinesiology Web Module** delivers the clinical practitioner user experience for therapeutic care encounters within the Kinergy platform. It provides interactive, accessible, and resilient user interfaces for:

- Initiating clinical treatment sessions from booked scheduling appointments.
- Managing active encounters in real-time with structured SOAP progress notes charting.
- Performing practitioner handover / reassignment.
- Irrevocably signing and completing clinical sessions.
- Reviewing client longitudinal treatment histories and cross-context timeline audit streams.

---

## 2. Directory Structure & File Ownership

```text
apps/web/src/modules/kinesiology/
├── api/
│   ├── kinesiology-api.ts          # Central HTTP client calls to /api/v1/kinesiology
│   └── index.ts
├── components/
│   ├── assign-therapist-modal.tsx  # Modal dialog for practitioner handover
│   ├── cancel-session-modal.tsx    # Modal dialog for cancelling scheduled session
│   ├── complete-session-modal.tsx  # Confirmation dialog for signing off session
│   ├── session-status-badge.tsx    # Semantic status badge (SCHEDULED, IN_PROGRESS, etc.)
│   ├── soap-notes-form.tsx         # React Hook Form + Zod SOAP charting component
│   ├── start-treatment-from-appointment.tsx # Appointment-to-Session initiation component
│   ├── treatment-history-list.tsx  # 4-state table with URL query filter & pagination
│   └── index.ts
├── hooks/
│   ├── use-client-treatment-history.ts # TanStack Query hook for treatment history
│   ├── use-treatment-mutations.ts  # TanStack mutations with targeted cache invalidation
│   ├── use-treatment-session.ts    # TanStack Query hook for session detail & query keys
│   └── index.ts
├── routes/
│   ├── client-treatment-history-page.tsx # Client profile treatment history tab page
│   ├── treatment-session-workspace-page.tsx # Clinical treatment workspace page
│   └── index.ts
├── schemas/
│   ├── assign-therapist.schema.ts  # Zod schema for therapist assignment
│   ├── cancel-session.schema.ts    # Zod schema for session cancellation reason
│   ├── session-notes.schema.ts     # Zod schema for SOAP progress notes (10k char bounds)
│   └── index.ts
├── types/
│   ├── treatment-history.types.ts  # DTO and filter interfaces for history queries
│   ├── treatment-session.types.ts  # DTO and payload interfaces for sessions
│   └── index.ts
├── __tests__/                      # Comprehensive Vitest / React Testing Library suites
└── index.ts                        # Public module contract exports
```

---

## 3. Route Ownership & Module Registration

The module is registered in `apps/web/src/app/routes/app-router.tsx` via `moduleRegistry`:

| Route Path                         | View / Component                | Required Permission         | Description                                                         |
| :--------------------------------- | :------------------------------ | :-------------------------- | :------------------------------------------------------------------ |
| `/kinesiology/sessions/:sessionId` | `TreatmentSessionWorkspacePage` | `kinesiology.sessions.read` | Clinical encounter charting and lifecycle actions.                  |
| `/clients/:clientId/treatments`    | `ClientTreatmentHistoryPage`    | `kinesiology.sessions.read` | Dedicated tab in Client Profile for treatment history.              |
| `/clients/:clientId/timeline`      | `ClientTimelinePage`            | `clients.read`              | Longitudinal activity timeline consuming cross-context projections. |

---

## 4. Query Key Hierarchy & Cache Invalidation

The module defines stable, hierarchical TanStack Query keys:

```ts
export const kinesiologyQueryKeys = {
  all: ['kinesiology'] as const,
  sessions: () => [...kinesiologyQueryKeys.all, 'sessions'] as const,
  session: (id: string) => [...kinesiologyQueryKeys.sessions(), id] as const,
  histories: () => [...kinesiologyQueryKeys.all, 'history'] as const,
  history: (clientId: string, filters?: TreatmentHistoryFilterParams) =>
    [...kinesiologyQueryKeys.histories(), clientId, filters] as const,
};
```

### Targeted Cache Invalidation Matrix

| Mutation              | Session Cache  | History Cache | Timeline Cache | Appointments Cache |
| :-------------------- | :------------: | :-----------: | :------------: | :----------------: |
| **`createSession`**   |       —        |  Invalidate   |   Invalidate   |     Invalidate     |
| **`startSession`**    | `setQueryData` |  Invalidate   |       —        |         —          |
| **`updateNotes`**     | `setQueryData` |  Invalidate   |       —        |         —          |
| **`assignTherapist`** | `setQueryData` |  Invalidate   |       —        |         —          |
| **`completeSession`** | `setQueryData` |  Invalidate   |   Invalidate   |         —          |
| **`cancelSession`**   | `setQueryData` |  Invalidate   |   Invalidate   |         —          |

---

## 5. Authorization & Progressive Disclosure

UI interactions evaluate permissions via `useAuth().hasPermission()`:

- `kinesiology.sessions.treat`: Enables "Start Session", "Sign & Complete", "Cancel Session", and SOAP form editing.
- `kinesiology.sessions.assign`: Enables "Change Therapist" handover modal.
- `kinesiology.sessions.read`: Required to load session details and clinical history.

Backend authorization remains authoritative and strictly enforces security via NestJS `AuthorizationGuard`.
