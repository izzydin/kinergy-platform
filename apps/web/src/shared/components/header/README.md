# Header Framework — Slot Strategy & Architecture

The **Header Framework** (`apps/web/src/shared/components/header/`) provides a presentation-only application header shell with zero business domain logic or authentication dependencies.

It exposes flexible extension slots for feature modules (`src/modules/*`) to inject contextual actions, account menus, and dynamic breadcrumbs.

---

## Extension Slots Overview

| Slot Prop     | Purpose                                               | Default Placeholder Component |
| :------------ | :---------------------------------------------------- | :---------------------------- |
| `breadcrumbs` | Dynamic route breadcrumbs path bar                    | `<BreadcrumbsPlaceholder />`  |
| `userMenu`    | User profile avatar & account dropdown                | `<UserMenu />`                |
| `extra`       | Custom action widgets (theme toggle, tenant selector) | `undefined`                   |

---

## Usage Examples

### 1. Default Header Shell

```tsx
import { Header } from '@/shared/components/header';

export const MyLayout = () => (
  <div>
    <Header />
    <main>...</main>
  </div>
);
```

### 2. Injecting Custom Module Slots

```tsx
import { Header } from '@/shared/components/header';

export const CustomHeader = () => (
  <Header
    breadcrumbs={<MyCustomBreadcrumbs />}
    userMenu={<MyUserProfileDropdown />}
    extra={<ThemeToggleWidget />}
  />
);
```
