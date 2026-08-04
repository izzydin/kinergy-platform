# Navigation Framework Architecture (`apps/web/src/app/navigation/`)

- **Status:** Active / Authoritative Architecture Standard
- **Scope:** `@kinergy-platform/web` (`apps/web/src/app/navigation/`) and Feature Modules (`src/modules/*/`)
- **Target Technology:** Configuration-Driven Navigation & Dynamic Registry

---

## 1. Overview & Architecture Role

The **Navigation Framework** provides a configuration-driven navigation infrastructure for the Kinergy Platform.

It guarantees that:

1. **Zero Hardcoded Sidebar Items**: Navigation entries are NEVER hardcoded inside visual Sidebar or Layout components.
2. **Dynamic Feature Module Registration**: Feature modules (`src/modules/*`) register their navigation entries through `navigationRegistry.register()` in their public API.
3. **Permission & Multi-Tenant Boundaries**: Navigation entries specify `requiredPermissions` and `requiredTenantFeatures`, which are evaluated dynamically at runtime by `NavigationBuilder`.
4. **Lazy-Load Friendly**: Navigation items specify path targets and route metadata without requiring eager loading of feature view components.

---

## 2. Navigation Architecture Components

```
+-----------------------------------------------------------------------+
|                         Feature Modules                               |
| (src/modules/client, src/modules/energy, src/modules/analytics)        |
+-----------------------------------------------------------------------+
                                   |
                                   v  (navigationRegistry.register)
+-----------------------------------------------------------------------+
|                        navigationRegistry                             |
|              (Central Map<string, NavigationItem>)                    |
+-----------------------------------------------------------------------+
                                   |
                                   v
+-----------------------------------------------------------------------+
|                         NavigationBuilder                             |
|  - Evaluates active session permissions (useAuth)                     |
|  - Evaluates multi-tenant feature flags (useFeatureFlags)             |
|  - Sorts items by weight order                                        |
|  - Groups items into structured NavigationSections                    |
+-----------------------------------------------------------------------+
                                   |
                                   v
+-----------------------------------------------------------------------+
|                        NavigationProvider                             |
|          (Exposes sections, items, activeItem, registerNavItem)       |
+-----------------------------------------------------------------------+
                                   |
                                   v
+-----------------------------------------------------------------------+
|                         DashboardLayout                               |
|        (Renders configuration-driven sidebar sections & items)        |
+-----------------------------------------------------------------------+
```

---

## 3. Registering Feature Module Navigation

Feature modules register navigation entries during initial module registration or public API loading:

```typescript
import { navigationRegistry } from '@/app/navigation';
import { Users } from 'lucide-react';

navigationRegistry.register({
  id: 'client:directory',
  label: 'Client Profiles',
  path: '/clients',
  icon: Users,
  order: 20,
  section: 'core',
  requiredPermissions: ['client:read'],
});
```

---

## 4. Governance & Principles

- **Configuration-Driven**: UI navigation structures are generated from data definitions.
- **Permission-Ready**: Items missing user permissions are automatically stripped from rendering.
- **Multi-Tenant Ready**: Items requiring disabled SaaS tier feature flags are filtered out.
- **Decoupled Layouts**: `DashboardLayout` renders `sections` from `useNavigation()` without knowing domain specifics.
