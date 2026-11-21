# ADR-AI-06-003: Tenant-Scoped Retrieval & Visibility Scope Filtering

## Status

Accepted

## Context

Kynergy Platform is a multi-tenant enterprise platform where clinical documents, training protocols, and proprietary business materials must never leak across tenant boundaries or unauthorized staff roles.

Mandatory Development Contract 6 mandates:

- "Enforce authorization at the repository query boundary."
- "Tenant and document restrictions must be applied BEFORE ranking and LIMIT."
- "Never retrieve cross-tenant information."
- "Do not trust tenant identifiers supplied directly by clients."
- "Resolve authorization context from authenticated server-side identity."

Additionally, knowledge documents possess visibility scopes defined by `VisibilityScope` enum:

- `ALL_STAFF`: Accessible to any authenticated tenant user.
- `TRAINERS_ONLY`: Accessible to Trainers and Owners.
- `THERAPISTS_ONLY`: Accessible to Kinesiologists/Therapists and Owners.
- `ADMIN_ONLY`: Accessible strictly to Owners / Administrators.

## Decision

1. **Server-Side Authorization Resolution:**
   - Client requests pass through `AuthenticationGuard` and `AuthorizationGuard`.
   - The application service constructs `RetrievalAuthContext` extracting `tenantId`, `userId`, and `roles` from `AuthenticatedUserPayload`.
   - Any client-supplied `tenantId` is ignored and rejected.
2. **Role-to-Scope Mapping Policy:**
   - `Owner` / `Admin`: Allowed all scopes (`[ALL_STAFF, TRAINERS_ONLY, THERAPISTS_ONLY, ADMIN_ONLY]`).
   - `Therapist` / `Kinesiologist`: Allowed `[ALL_STAFF, THERAPISTS_ONLY]`.
   - `Trainer`: Allowed `[ALL_STAFF, TRAINERS_ONLY]`.
   - Other staff (`Receptionist`, `Kitchen Staff`): Allowed `[ALL_STAFF]`.
3. **Double Tenant Scoping in SQL:**
   - Both `index_generations.tenant_id` and `knowledge_documents.tenant_id` are asserted equal to the authenticated `tenantId`.
   - Even in the event of an orphaned embedding or corrupted generation reference, cross-tenant chunks cannot be returned.
4. **Active Generation Enforcement:**
   - The retrieval pipeline queries `IIndexGenerationRepositoryPort.findActiveByTenantId(tenantId)` to identify the tenant's single authoritative active vector index.
   - Searches against non-active or draft generations are blocked with `ActiveIndexGenerationNotFoundException`.
5. **Soft-Delete Invariant:**
   - `kd.deleted_at IS NULL` is checked in SQL to prevent deleted documents from appearing in search results.

## Consequences

### Positive

- **Impenetrable Tenant Isolation:** Physical data isolation guaranteed at the PostgreSQL query level.
- **Granular Least Privilege:** Clinical notes are hidden from trainers, and administrative files are hidden from general staff.
- **Compliance:** Full alignment with HIPAA, GDPR, and enterprise multi-tenant privacy mandates.

### Negative / Trade-offs

- The application service must compute the allowed visibility scopes for the user prior to query invocation.
