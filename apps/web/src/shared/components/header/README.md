# Header Framework — Slot Strategy & Architecture

The **Header Framework** (`apps/web/src/shared/components/header/`) provides a presentation-only application header shell with zero business domain logic or authentication dependencies.

It exposes flexible extension slots for future feature modules (`src/modules/*`) to inject search engines, notification feeds, account menus, and dynamic breadcrumbs.

---

## Extension Slots Overview

| Slot Prop       | Purpose                                               | Default Placeholder Component  |
| :-------------- | :---------------------------------------------------- | :----------------------------- |
| `breadcrumbs`   | Dynamic route breadcrumbs path bar                    | `<BreadcrumbsPlaceholder />`   |
| `search`        | Global command palette / search input                 | `<SearchPlaceholder />`        |
| `notifications` | Real-time notifications bell / drawer trigger         | `<NotificationsPlaceholder />` |
| `userMenu`      | User profile avatar & account dropdown                | `<UserMenuPlaceholder />`      |
| `extra`         | Custom action widgets (theme toggle, tenant selector) | `undefined`                    |

---

## Usage Examples

### 1. Default Header Shell (Uses Placeholders)

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
    search={<MyCommandPaletteSearch />}
    notifications={<MyNotificationDrawerTrigger />}
    userMenu={<MyUserProfileDropdown />}
    extra={<ThemeToggleWidget />}
  />
);
```
