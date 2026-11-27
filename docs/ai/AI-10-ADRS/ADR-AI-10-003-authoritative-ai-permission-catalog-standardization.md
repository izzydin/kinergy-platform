# ADR-AI-10-003: Authoritative AI Permission Catalog Standardization

## Status

Accepted

## Context

Kynergy Platform enforces Role-Based Access Control (RBAC) via the declarative `@RequirePermissions()` decorator, handled by `AuthorizationGuard` and evaluated by `DefaultAuthorizationEvaluator` against the authoritative permission catalog in `apps/api/src/platform/identity/authorization/permissions.ts`.

Currently, `PERMISSIONS.AI` contains only a single permission:

```typescript
AI: {
  CONVERSATIONS_AUDIT: 'ai.conversations.audit',
}
```

Consequently, other AI controllers (such as `AiDocumentController`, `AiIngestionController`, and `AiRAGController`) resort to ad-hoc, manual role-string checks inside controller handler methods (e.g., checking if `user.roles` contains `'owner'`, `'admin'`, `'manager'`, or `'gestor'`).

This manual approach introduces several architectural liabilities:

- Inconsistent authorization syntax across controllers.
- Inability to declare capabilities on Swagger/OpenAPI documentation.
- Risk of typos in role string arrays.
- Impossibility of assigning granular AI permissions to custom tenant roles.

## Decision

1. **Standardize and Expand `PERMISSIONS.AI`:**
   Expand `PERMISSIONS.AI` in `apps/api/src/platform/identity/authorization/permissions.ts` with six canonical dot-notation codes:
   - `ai.conversations.create`: Right to initiate conversation sessions and submit prompt turns.
   - `ai.conversations.manage`: Right to archive or modify conversations across the tenant (Owner/Admin).
   - `ai.conversations.audit`: Right to inspect conversation histories for compliance oversight (Owner).
   - `ai.documents.upload`: Right to upload knowledge documents into the tenant knowledge base.
   - `ai.documents.manage`: Right to edit metadata, soft-delete, restore, or retry ingestion for tenant documents.
   - `ai.knowledge.query`: Right to execute direct RAG semantic/hybrid retrieval queries.

2. **Map System Roles to AI Permissions in `SYSTEM_ROLE_PERMISSIONS`:**
   - **`Owner`:** Receives all AI permissions (`ALL_PERMISSION_CODES`).
   - **`Therapist` / `Kinesiologist`:** Receives `ai.conversations.create`, `ai.documents.upload`, `ai.knowledge.query`.
   - **`Trainer`:** Receives `ai.conversations.create`, `ai.documents.upload`, `ai.knowledge.query`.
   - **`Receptionist` / `Kitchen Staff`:** Receives `ai.conversations.create`, `ai.knowledge.query`.

3. **Refactor Controllers to Use Declarative `@RequirePermissions()`:**
   Replace inline role checks with `@RequirePermissions(PERMISSIONS.AI.<CODE>)` across AI controllers, delegating enforcement to `AuthorizationGuard`.

## Consequences

### Positive

- Fully integrates AI capabilities into Kynergy's unified platform RBAC architecture.
- Eliminates brittle string-array checks in application controllers.
- Enables granular capability assignment for future enterprise custom roles.
- Exposes clear permission requirements in OpenAPI / Swagger documentation.

### Negative / Trade-offs

- Unit tests that mock `AuthorizationGuard` or test controller route metadata must be updated to expect the new `@RequirePermissions` metadata.
