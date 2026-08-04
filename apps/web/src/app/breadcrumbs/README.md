# Breadcrumb Framework — Architecture & Metadata Strategy

The **Breadcrumb Framework** (`apps/web/src/app/breadcrumbs/`) provides a metadata-driven, automatic breadcrumb generation engine.

Page components **never manually build or hardcode breadcrumbs**. Instead, breadcrumb trails are dynamically derived from:

1. React Router route `handle.breadcrumb` metadata.
2. Navigation Framework item configurations registered in `navigationRegistry`.
3. Path segment hierarchy fallback resolution.

---

## Architectural Components

- **`BreadcrumbProvider`**: React Context Provider mounted in `AppProvider` wrapping the application.
- **`BreadcrumbGenerator`**: Pure utility engine converting route matches and URL locations into structured `BreadcrumbItem[]` arrays.
- **`<Breadcrumb />`**: Accessible visual navigation bar with HTML5 `<nav aria-label="Breadcrumb Navigation">` and `aria-current="page"`.

---

## How Future Feature Modules Contribute Breadcrumbs

### Option 1: Route `handle` Metadata (Recommended)

Feature modules (`src/modules/*`) declare route `handle` metadata in their route definitions:

```tsx
<Route
  path="/clients/:id"
  element={<ClientDetailView />}
  handle={{
    breadcrumb: (params) => `Client #${params.id}`,
  }}
/>
```

### Option 2: Navigation Framework Registration

Feature modules registering items with `navigationRegistry.register(...)` automatically contribute labels, paths, and icons to the breadcrumb generator:

```typescript
navigationRegistry.register({
  id: 'client:directory',
  label: 'Client Directory',
  path: '/clients',
  section: 'core',
});
```

### Option 3: Dynamic Runtime Overrides (Rare Edge Cases)

For deep detail views requiring backend entity titles, sub-views can set dynamic breadcrumb overrides via `useBreadcrumbs()`:

```tsx
const { setCustomBreadcrumbs } = useBreadcrumbs();

useEffect(() => {
  setCustomBreadcrumbs([
    { id: 'home', label: 'Dashboard', path: '/', isCurrent: false },
    { id: 'clients', label: 'Clients', path: '/clients', isCurrent: false },
    { id: 'detail', label: clientData.name, isCurrent: true },
  ]);
  return () => setCustomBreadcrumbs(null);
}, [clientData]);
```
