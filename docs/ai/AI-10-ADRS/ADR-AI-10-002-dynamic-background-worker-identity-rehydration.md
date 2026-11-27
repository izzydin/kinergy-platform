# ADR-AI-10-002: Dynamic Background Worker Identity Rehydration

## Status

Accepted

## Context

AI turn generation in Kynergy is decoupled from the HTTP request lifecycle via asynchronous queues and background workers (`AiTurnDispatcherService` and `AiTurnGenerationWorker`). During normal generation, the initiating user's `actorContext` (including their assigned roles and permissions) is passed into the execution pipeline.

However, when a worker instance crashes or a turn lease expires while in `PENDING` or `STREAMING` status, `AiTurnGenerationWorker.poll()` periodically recovers and re-dispatches these turns from the database. In the existing implementation (finding `KY-SEC-004`):

```typescript
// apps/api/src/ai/services/generation/ai-turn-generation.worker.ts:188-191
actorContext: {
  roles: [],
  permissions: [],
}
```

Because the retrieval security policy fails closed, an empty roles array causes `resolveAllowedVisibilityScopes([])` to return `[]`. Consequently, the recovered turn retrieves zero document chunks and generates an ungrounded or empty response, creating availability degradation.

Two architectural options were evaluated to restore identity context during worker recovery:

1. _Option A (Static Serialization):_ Serialize the user's roles into the `ai_conversation_turns` database table at the time of reservation.
2. _Option B (Dynamic Rehydration):_ Fetch the user record from `IUserRepository.findById(conv.userId)` at the moment of recovery.

## Decision

1. **Adopt Dynamic Rehydration (Option B):**
   `AiTurnGenerationWorker` will inject `IUserRepository` via the existing `USER_REPOSITORY` token. Upon picking up a recoverable turn:
   - Worker queries `conv = await this.convRepo.findById(tenantId, turn.conversationId)`.
   - Worker queries `user = await this.userRepo.findById(conv.userId)`.
2. **Fail-Closed Account Status Check:**
   If `user` is not found or `user.status !== UserStatus.ACTIVE`, the turn MUST NOT be re-dispatched. The worker transitions the turn directly to `TurnStatus.FAILED` with error code `ACCOUNT_INACTIVE`.
3. **Current Role Projection:**
   If the user is active, the worker constructs `actorContext` using `user.roles` and `user.permissions` retrieved directly from PostgreSQL.

## Consequences

### Positive

- **Eliminates Worker Availability Degradation:** Interrupted turns recover with legitimate clinician roles, retrieving all authorized knowledge chunks.
- **Immediate Revocation Parity:** If an employee is deactivated or their roles are modified during an outage, recovered turns immediately reflect their new permission boundary rather than executing with stale serialized privileges.
- **Zero Schema Migrations:** Avoids adding redundant JSON or string-array columns to the `ai_conversation_turns` table.

### Negative / Trade-offs

- Adds a single fast primary-key read (`findById`) on the `User` table per recovered turn. Given that recovery polling executes in batches of 10 every 15 seconds during abnormal recovery events, the performance overhead is negligible.
