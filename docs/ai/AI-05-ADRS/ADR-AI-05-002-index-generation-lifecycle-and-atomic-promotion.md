# ADR-AI-05-002: Index Generation Lifecycle & Zero-Downtime Atomic Promotion

## Status

Accepted

## Context

As a business platform, Kynergy serves ongoing user queries, scheduling operations, and semantic knowledge retrieval. Re-indexing documents (e.g., when updating an embedding model, tuning chunking parameters, or disaster recovery) can take significant processing time.

Updating vectors in-place on existing chunks would cause partial search results, inconsistent hybrid search, or query downtime during the rebuild. Furthermore, mixing vectors from different model generations in a single search space degrades similarity ranking.

## Decision

1. Introduce an `IndexGeneration` Aggregate Root managing index generations per tenant.
2. Structure the generation lifecycle as an explicit state machine:
   `DRAFT` $\rightarrow$ `BUILDING` $\rightarrow$ `VALIDATING` $\rightarrow$ `ACTIVE` $\rightarrow$ `RETIRED` (with terminal `FAILED` and `CANCELLED` states).
3. Enforce the **Single Active Generation Invariant**: A tenant has at most one `ACTIVE` generation at any point in time. Incoming semantic queries strictly target the active generation.
4. Support zero-downtime re-indexing: New index generations build and validate in the background while the currently active generation serves queries uninterrupted.
5. Execute index switchover as an atomic database transaction (`promoteGeneration`): Generation $N$ transitions to `RETIRED` and Generation $N+1$ transitions to `ACTIVE` simultaneously.
6. Provide instant rollback capability: If Generation $N+1$ encounters post-deployment anomalies, operators can reactivate Generation $N$ or rollback to a previous generation.

## Consequences

### Positive

- Zero search downtime during index upgrades or re-chunking.
- No partial query states or dirty reads during batch vector ingestion.
- Safe, observable, and fully reversible model rollouts.

### Negative / Trade-offs

- Temporary storage overhead during re-indexing while both active and building generations coexist. Retired generations must be pruned after a retention grace period.
