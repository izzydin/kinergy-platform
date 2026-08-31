# ADR-0095: Resource Sensitive Valuation Data Access and Response-Shaping Policy

## Status

`ACCEPTED`

## Context

In the Resources Management domain (Phase 6), consumable inventory items and fixed assets carry both operational metadata (SKU, title, quantity on hand, location, status, condition) and sensitive financial data (purchase acquisition cost, retail margins, aggregate working capital valuation, fixed asset book value, write-down revaluations).

Operational staff (e.g. Trainers, Therapists, Kitchen Staff, Front-desk Receptionists) need full access to operational telemetry to perform day-to-day work, but exposing internal wholesale purchase costs or aggregate balance sheet valuations presents significant data privacy, business confidentiality, and financial audit risks.

## Decision

1. **Permission Composition for Financial Operations**:
   - Revaluation mutations (`UpdateFixedAssetValuationCommand`) require dual permissions: `@Permissions('assets.write', 'billing.read')`.
   - Valuation read queries (`GetInventoryValuationQuery`, `GetAssetValueQuery`) require dual permissions: `@Permissions('inventory.read'|'assets.read', 'billing.read')`.
2. **Structural Endpoint and DTO Segregation**:
   - Operational endpoints (`GET /api/v1/resources/assets/:id`, `GET /api/v1/resources/assets`) return operational DTOs (`FixedAssetResponseDto`) that intentionally omit acquisition costs and current estimated fair value.
   - Dedicated valuation endpoints (`GET /api/v1/resources/assets/:id/valuation`, `GET /api/v1/resources/inventory/valuation`) return confidential financial DTOs (`FixedAssetValuationResponseDto`, `InventoryValuationResponseDto`) guarded by `billing.read`.
3. **Multi-Tenant and Provenance Enforcement**:
   - Multi-tenant isolation is enforced at the repository level via `where: { tenantId }`.
   - Actor provenance is derived strictly from `@CurrentUser()` (`user.userId`), rejecting body-supplied identity spoofing.

## Consequences

### Positive

- Prevents balance sheet and supplier pricing disclosure to operational staff without creating fragmented or complex runtime AST filters.
- Preserves clean, deterministic OpenAPI/Swagger DTO schemas.
- Reuses existing Phase 1 `billing.read` permission, avoiding permission catalog explosion.
- Enforces multi-tenant isolation and actor provenance across all resource endpoints.

### Negative / Trade-offs

- Callers requiring both operational details and financial valuation for an asset must execute two separate queries if authorized.
