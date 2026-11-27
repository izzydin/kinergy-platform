# ADR-AI-10-001: Resource-Level Conversation Authorization and BOLA Defense

## Status

Accepted

## Context

In milestone AI-09, Kynergy introduced the AI Conversation Subsystem (`AiConversationController`, use cases, and repositories). While strict multi-tenant isolation was implemented and verified across all operations (`conv.tenantId === actor.tenantId`), resource-level ownership validation was omitted on several key endpoints:

- `GET /ai/conversations/:id`
- `GET /ai/conversations/:id/messages`
- `PATCH /ai/conversations/:id/title`
- `DELETE /ai/conversations/:id`

In clinical and wellness environments, conversations contain private health queries, draft clinical assessments, and sensitive differential notes. Under the existing implementation (identified as `KY-SEC-002`), any authenticated user within Tenant A could query, rename, or archive conversations belonging to any other user within Tenant A simply by knowing or enumerating the conversation UUID.

Furthermore, returning `403 Forbidden` when a clinician attempts to access a colleague's conversation confirms the existence of that conversation, enabling internal IDOR enumeration.

## Decision

1. **Enforce Creator Ownership by Default:**
   All standard conversation lifecycle operations (`GET :id`, `GET :id/messages`, `PATCH :id/title`, `POST :id/turns`, `POST :id/cancel`) must strictly assert:
   ```typescript
   if (conv.tenantId !== actor.tenantId || conv.userId !== actor.actorId) {
     throw new ConversationNotFoundError(conv.id, actor.tenantId);
   }
   ```
2. **Anti-Enumeration 404 Response:**
   Attempts to access another user's conversation within the same tenant must return `404 Not Found` (via `ConversationNotFoundError`), preventing malicious or curious users from learning whether a given UUID represents a valid peer conversation.
3. **Restricted Administrative Override for Archiving Only:**
   Only the soft-delete (`DELETE /ai/conversations/:id`) endpoint supports an administrative override allowing users with the `ai.conversations.manage` permission or `Owner`/`Admin` role to archive a conversation (e.g., during employee offboarding). Non-owner archiving attempts by standard staff return `403 Forbidden`.
4. **Preserve Privileged Inspection Boundary:**
   Supervisor/Owner inspection of peer consultations remains strictly isolated to the audited `POST /ai/conversations/:id/audit-inspect` endpoint, which enforces `@Roles('Owner')`, `ai.conversations.audit`, a mandatory structured justification reason, and an immutable audit log write.

## Consequences

### Positive

- Completely eliminates Same-Tenant Broken Object Level Authorization (BOLA / IDOR).
- Protects clinician consultation privacy in shared organizational environments.
- Anti-enumeration design prevents resource discovery across peer users.
- Retains auditable administrative governance for offboarding and compliance oversight.

### Negative / Trade-offs

- Integration tests that previously mocked conversation retrieval without matching `userId` must be updated to align with the stricter ownership invariant.
