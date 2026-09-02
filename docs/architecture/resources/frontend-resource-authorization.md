# Phase 6: Frontend Resource Authorization & Progressive Disclosure Architecture

**Status**: Authoritative & Approved  
**Milestone**: Phase 6.11 — Frontend Architecture Preparation  
**Domain**: Frontend Capability Expression, Progressive Disclosure, Sensitive Financial Data Policy & Backend Authority Boundary  
**Author**: Application Security Engineer & Principal Frontend Architect  
**Governing ADRs**:

- [**ADR-0094: Resources Authorization and Permission Taxonomy Model**](./adr/0094-resources-authorization-and-permission-taxonomy-model.md)
- [**ADR-0095: Resource Sensitive Valuation Data Access and Response Shaping Policy**](./adr/0095-resource-sensitive-valuation-data-access-and-response-shaping-policy.md)
- [**Phase 6 Resource Authorization Testing Report**](./resource-authorization-testing.md)
- [**Phase 6 Frontend Routing Architecture**](./frontend-routing-architecture.md)

---

## 1. Explicit Backend Authority Statement

> [!CAUTION]
> **Authoritative Security Boundary**:
> Frontend permission checks (`useAuth().currentUser.permissions`, `<HasPermission />`, `<RequirePermission />`) **NEVER** protect Kinergy data. A client-side check exists purely to improve usability by communicating user capability and hiding inaccessible actions.
>
> The backend NestJS API (`@RequirePermissions()`, Guards, Interceptors) independently and authoritatively evaluates every HTTP request using cryptographically verified JWT claims. Hiding a button in the React UI provides zero security guarantee against crafted network requests.

---

## 2. Phase 6 Permission Matrix & Frontend Capabilities

The backend defines five canonical permissions for the Resources Management bounded context. The frontend maps these permissions directly to view access, interactive action triggers, and sensitive data fields:

| Business Area    | Operation / Capability                                                 | Required Permission               | Frontend UI Expression                                                               | Backend Enforcement                                                      |
| :--------------- | :--------------------------------------------------------------------- | :-------------------------------- | :----------------------------------------------------------------------------------- | :----------------------------------------------------------------------- |
| **Inventory**    | View product catalog & stock levels                                    | `inventory.read`                  | Shows Inventory tab, product table, and detail views                                 | `GET /resources/inventory`                                               |
| **Inventory**    | View stock movement ledger                                             | `inventory.read`                  | Displays movement history sub-table                                                  | `GET /resources/inventory/:id/movements`                                 |
| **Inventory**    | Create new product                                                     | `inventory.write`                 | Displays "Register Product" CTA button & enables `/new` form                         | `POST /resources/inventory`                                              |
| **Inventory**    | Update product metadata                                                | `inventory.write`                 | Displays "Edit Details" button & enables metadata modal                              | `PATCH /resources/inventory/:id`                                         |
| **Inventory**    | Archive / Reactivate product                                           | `inventory.write`                 | Displays "Archive" / "Reactivate" actions in dropdown                                | `POST /resources/inventory/:id/archive`                                  |
| **Inventory**    | Record stock transactions (Purchase, Sale, Consumption, Scrap, Adjust) | `inventory.write`                 | Displays "Receive Stock", "Record Sale", "Consume", "Scrap", "Adjust" action buttons | `POST /resources/inventory/:id/{purchase,sale,consumption,scrap,adjust}` |
| **Fixed Assets** | View asset directory, condition & history                              | `assets.read`                     | Shows Fixed Assets tab, asset directory table, and detail views                      | `GET /resources/assets`                                                  |
| **Fixed Assets** | Register new fixed asset                                               | `assets.write`                    | Displays "Register Asset" CTA button & enables `/new` form                           | `POST /resources/assets`                                                 |
| **Fixed Assets** | Transfer location / room                                               | `assets.write`                    | Displays "Transfer Location" action modal trigger                                    | `POST /resources/assets/:id/transfer`                                    |
| **Fixed Assets** | Change lifecycle status                                                | `assets.write`                    | Displays "Change Status" state transition modal trigger                              | `POST /resources/assets/:id/status`                                      |
| **Fixed Assets** | Update condition rating                                                | `assets.write`                    | Displays "Update Condition" modal trigger                                            | `POST /resources/assets/:id/condition`                                   |
| **Fixed Assets** | Log maintenance service                                                | `assets.write`                    | Displays "Log Maintenance" service form trigger                                      | `POST /resources/assets/:id/maintenance`                                 |
| **Fixed Assets** | Revalue book / market value                                            | `assets.write` + `valuation.read` | Displays "Update Valuation" financial appraisal modal trigger                        | `POST /resources/assets/:id/valuation`                                   |
| **Valuation**    | View inventory stock valuation                                         | `valuation.read`                  | Displays inventory capital valuation widgets & category breakdown                    | `GET /resources/valuation/inventory`                                     |
| **Valuation**    | View asset carrying vs CAPEX value                                     | `valuation.read`                  | Displays asset financial valuation summary & status breakdown                        | `GET /resources/valuation/assets`                                        |
| **Valuation**    | View executive portfolio overview                                      | `valuation.read`                  | Enables Overview tab (`/resources/overview`) and portfolio KPI cards                 | `GET /resources/valuation/combined`                                      |

---

## 3. UI Guard Strategy & Progressive Disclosure

### 1. Route Guarding (`RequirePermission`)

- `/resources/inventory/*` is wrapped in `<RequirePermission permission="inventory.read">`.
- `/resources/assets/*` is wrapped in `<RequirePermission permission="assets.read">`.
- `/resources/overview` is wrapped in `<RequirePermission permission="valuation.read">`.
- If a user navigates directly to a forbidden URL, `RequirePermission` renders `<ForbiddenView />` (`403 Access Denied`) without redirecting to login.

### 2. Navigation Visibility Guarding

In `apps/web/src/app/navigation/navigation.config.ts`, the root `/resources` entry declares:

```typescript
requiredPermissions: ['inventory.read', 'assets.read', 'valuation.read'];
```

The sidebar only renders the Resources menu item if the user possesses at least one of these claims. Sub-navigation tabs within the module hide inaccessible sections.

### 3. Action & Modal Trigger Guarding (`HasPermission`)

Action triggers and mutation buttons use declarative `<HasPermission />` wrappers:

```tsx
<HasPermission name="inventory.write">
  <Button onClick={() => setPurchaseModalOpen(true)}>Receive Stock</Button>
</HasPermission>
```

---

## 4. Sensitive Valuation Data Visibility Policy

In compliance with **ADR-0095**, financial valuation data is strictly segregated from operational catalog data:

```
┌────────────────────────────────────────────────────────┐
│ Operational User (e.g. Trainer, Practitioner)          │
│ Permissions: `inventory.read`, `assets.read`           │
├────────────────────────────────────────────────────────┤
│ - Sees product names, SKUs, categories, and stock qty  │
│ - Sees asset tags, physical locations, and condition   │
│ - Purchase Cost & Carrying Value fields are MASKED     │
│   (Rendered as "—" or hidden from table columns)       │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│ Financial / Administrative User (e.g. Owner, Manager)  │
│ Permissions: `valuation.read` + `*.read`               │
├────────────────────────────────────────────────────────┤
│ - Sees unit purchase costs & selling prices            │
│ - Sees individual asset carrying values & CAPEX cost   │
│ - Sees aggregate working capital & portfolio value KPI │
└────────────────────────────────────────────────────────┘
```

---

## 5. Backend-Denial & Stale-Permission Handling

When a user's session token expires or permissions are revoked server-side while the frontend remains active:

```
[User Submits Mutation (e.g. Transfer Asset)]
                     │
                     ▼
[Backend Interceptor Returns 403 Forbidden / 401 Unauthorized]
                     │
                     ▼
[`useNotification().error()` Displays Standardized Toast]
                     │
                     ▼
[TanStack Query Automatically Invalidates Target Query Keys]
                     │
                     ▼
[UI Refetches & Reconciles Current Server Authority State]
```

1. **Zero Silent Success**: The UI never assumes a mutation succeeded optimistically if the backend responds with `403 Forbidden` or `401 Unauthorized`.
2. **Actionable Toast Message**: Displays normalized error (e.g., `"Access Denied: You lack the required 'assets.write' permission for this action."`).
3. **Cache Reconciliation**: Query cache invalidates to sync with authoritative server data, automatically updating component capability states.
