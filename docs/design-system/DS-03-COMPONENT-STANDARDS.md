# DS-03 — Kinergy Design System: Shared UI Component Standards

**Document ID:** DS-03-COMPONENT-STANDARDS  
**Version:** 1.0  
**Status:** Approved & Implemented  
**Authoritative References:**

- [`docs/design-system/KIN-BRAND-UI-001.md`](./KIN-BRAND-UI-001.md) (Official Color Specification v1.0)
- [`docs/design-system/DS-01-REPOSITORY-AUDIT.md`](./DS-01-REPOSITORY-AUDIT.md) (Architecture Discovery & Inventory)
- [`docs/design-system/DS-02-TOKEN-ARCHITECTURE.md`](./DS-02-TOKEN-ARCHITECTURE.md) (Centralized Token Engine)

---

## 1. Architectural Scope & Objectives

The goal of **DS-03** is to standardize every shared UI component in the Kinergy platform using the centralized design tokens established in DS-02. This establishes visual consistency, robust keyboard interaction, and WCAG 2.2 AA accessibility compliance across all modules without breaking existing public component APIs or introducing third-party dependencies.

### Core Architectural Rules:

1. **Token Consumption:** Components must consume semantic CSS custom properties and Tailwind design system tokens (`bg-primary`, `bg-brand`, `bg-status-success`, `text-foreground`, etc.). Direct arbitrary hex or hardcoded Tailwind colors (e.g. `emerald-500/10`, `yellow-500/50`) are strictly eliminated.
2. **API Stability:** Public component contracts remain 100% backwards-compatible. New variants (such as `variant="primary"` and `variant="brand"`) exist alongside existing variants (`variant="default"`).
3. **WCAG 2.2 AA Compliance:** Every interactive component guarantees visible keyboard focus, distinct state indicators, accessible names, and never conveys status solely through color (WCAG 1.4.1).

---

## 2. Component System Standards

### 2.1 Button System (`<Button />`)

The button system standardizes action hierarchy and enforces high-contrast pairings.

| Variant                      | Role                                         | Background                          | Text/Foreground                                 | Verified Contrast | Focus Ring                       |
| :--------------------------- | :------------------------------------------- | :---------------------------------- | :---------------------------------------------- | :---------------- | :------------------------------- |
| **`primary` / `default`**    | Main call-to-action, primary submit          | `bg-primary` (Forest `#3F5F25`)     | `text-primary-foreground` (White `#FFFFFF`)     | **7.30:1** (AAA)  | `ring-ring ring-offset-2`        |
| **`brand`**                  | Kinergy signature action, marketing triggers | `bg-brand` (Green `#68CE39`)        | `text-brand-foreground` (Charcoal `#202522`)    | **7.77:1** (AAA)  | `ring-brand ring-offset-2`       |
| **`secondary`**              | Low-emphasis actions, card actions           | `bg-secondary` (Soft `#E5F6D9`)     | `text-secondary-foreground` (Forest `#3F5F25`)  | **6.44:1** (AA)   | `ring-ring ring-offset-2`        |
| **`outline`**                | Secondary triggers, modal cancellations      | `bg-card` (White `#FFFFFF`)         | `text-foreground` (Charcoal `#202522`)          | **14.85:1** (AAA) | `ring-ring ring-offset-2`        |
| **`ghost`**                  | Table row actions, icon buttons              | `transparent`                       | `text-foreground` (Charcoal `#202522`)          | **14.85:1** (AAA) | `ring-ring ring-offset-2`        |
| **`destructive` / `danger`** | Permanent deletion, destructive actions      | `bg-destructive` (Danger `#B91C1C`) | `text-destructive-foreground` (White `#FFFFFF`) | **6.47:1** (AA)   | `ring-destructive ring-offset-2` |
| **`link`**                   | Inline navigational triggers                 | `transparent`                       | `text-primary` (Forest `#3F5F25`)               | **7.30:1** (AAA)  | `ring-ring ring-offset-2`        |

#### Accessibility & State Guarantees:

- **Loading State (`isLoading`):** Disables element, sets `aria-busy="true"`, renders animated SVG spinner, and announces `loadingText` or preserves children.
- **Disabled State (`disabled`):** Pointer events disabled, `opacity-50`, no click handlers triggered.
- **Icon-Only Buttons (`size="icon"`):** Developers must provide an accessible name via `aria-label` or visually hidden child text.
- **Polymorphism (`asChild`):** Wraps child element (e.g. `<NavLink />` or `<a>`) via Radix `Slot`, merging classes without creating invalid nested button markup.

---

### 2.2 Form System Controls

Standardized form controls share common focus treatments, border tokens, and integration with `<FormField />`.

#### `<Input />` & `<PasswordInput />`

- **Border & Background:** `border border-input bg-background text-foreground shadow-sm`
- **Focus:** `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`
- **Invalid State:** `isInvalid={true}` activates `border-destructive focus-visible:ring-destructive` and sets `aria-invalid="true"`.
- **Password Toggle:** Built-in visibility switch button has accessible `aria-label` ("Show password" / "Hide password").

#### `<Textarea />`

- **Border & Background:** `border border-input bg-background text-foreground min-h-[80px]`
- **Focus:** `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`
- **Invalid State:** `isInvalid && 'border-destructive focus-visible:ring-destructive'`

#### `<Select />`

- **Container:** Native accessible `<select>` with custom `ChevronDown` adornment.
- **Focus & States:** Full focus-visible ring, disabled opacity, and invalid state indicators.

#### `<Checkbox />`

- **Indicator:** High-contrast box with SVG check icon. Checked state applies `bg-primary text-primary-foreground`.
- **Target Size (WCAG 2.5.8):** Adequate hit region with paired `<label />` and `<p class="text-xs text-muted-foreground" />` description.

#### `<Switch />`

- **Pattern:** WAI-ARIA switch trigger (`role="switch"`, `aria-checked={boolean}`).
- **Keyboard Support:** Toggles via mouse click, `Space` key, and `Enter` key.
- **Indicator:** Smooth CSS translation between active (`bg-primary`) and inactive (`bg-input`) states.

#### `<RadioGroup />` & `<Radio />`

- **Pattern:** `role="radiogroup"` managing compound `<Radio />` controls (`role="radio"`).
- **Selection:** Selected radio displays centered `bg-primary` disc.

---

### 2.3 Status & Feedback System

#### Semantic Status Tokens Mapping:

Every status representation must pair color with an icon and a descriptive text label (WCAG 2.2 AA SC 1.4.1).

| Domain Status                    | Semantic Status | Icon Component  | Light Surface                           | Foreground / Solid                  | Border Stroke                              |
| :------------------------------- | :-------------- | :-------------- | :-------------------------------------- | :---------------------------------- | :----------------------------------------- |
| **Paid / Active / Confirmed**    | `success`       | `CheckCircle2`  | `#E5F6D9` (`bg-status-success-surface`) | `#3F5F25` (`text-status-success`)   | `#68CE39` (`border-status-success-border`) |
| **Pending / Expiring Soon**      | `warning`       | `AlertTriangle` | `#FEF3C7` (`bg-status-warning-surface`) | `#B45309` (`text-status-warning`)   | `#FCD34D` (`border-status-warning-border`) |
| **Failed / Expired / Cancelled** | `danger`        | `AlertCircle`   | `#FEE2E2` (`bg-status-danger-surface`)  | `#B91C1C` (`text-status-danger`)    | `#FCA5A5` (`border-status-danger-border`)  |
| **Draft / Scheduled / Info**     | `info`          | `Info`          | `#E0F2FE` (`bg-status-info-surface`)    | `#0369A1` (`text-status-info`)      | `#7DD3FC` (`border-status-info-border`)    |
| **Inactive / Archived**          | `neutral`       | `MinusCircle`   | `#F4FAEF` (`bg-muted`)                  | `#68716B` (`text-muted-foreground`) | `#D8DDD9` (`border-border`)                |

#### `<StatusBadge />`

```tsx
import { StatusBadge } from '@kinergy-platform/ui';

// Soft tone (default)
<StatusBadge status="success" label="Active Membership" />
<StatusBadge status="warning" label="Expiring Soon" />
<StatusBadge status="danger" label="Payment Failed" />

// Solid tone
<StatusBadge status="success" label="Paid in Full" tone="solid" />
```

#### `<StatusIndicator />`

```tsx
import { StatusIndicator } from '@kinergy-platform/ui';

// Live pulse indicator for operational dashboards
<StatusIndicator status="success" label="System Operational" pulse />;
```

#### `<Alert />`

Updated `alertVariants` now consume canonical design tokens:

- `success`: `border-status-success-border bg-status-success-surface text-status-success`
- `warning`: `border-status-warning-border bg-status-warning-surface text-status-warning`
- `danger`: `border-status-danger-border bg-status-danger-surface text-status-danger`
- `info`: `border-status-info-border bg-status-info-surface text-status-info`

#### `<Toast />`

Updated `toastVariants` now consume canonical design tokens:

- `success`: `border-status-success-border bg-status-success text-status-success-foreground`
- `warning`: `border-status-warning-border bg-status-warning text-status-warning-foreground`
- `danger`: `border-status-danger-border bg-status-danger text-status-danger-foreground`
- `info`: `border-status-info-border bg-status-info text-status-info-foreground`

---

### 2.4 Layout & Navigation Components

#### `<Tabs />` System

- Compound components: `<Tabs />`, `<TabsList />`, `<TabsTrigger />`, `<TabsContent />`.
- Full WAI-ARIA implementation: `role="tablist"`, `role="tab"`, `role="tabpanel"`, `aria-selected`, `aria-controls`, and `aria-labelledby`.
- Selected tab uses `bg-background text-foreground shadow-sm font-semibold`.

#### `<Separator />`

- Semantic boundary line: `role="separator"` with `orientation="horizontal" | "vertical"`.
- When used purely for visual spacing, `decorative={true}` assigns `role="none"`.

#### Shell Standardization: `<Sidebar />`

- Eliminated legacy unapproved gradient (`via-blue-400 to-indigo-400`).
- Replaced with canonical Charcoal typography (`text-foreground font-extrabold`) yielding 14.85:1 contrast against sidebar card background.

---

## 3. Component API Compatibility Report

All existing component consumer APIs have been strictly preserved:

| Component    | Previous API                                                                         | Updated API                                                                                                                                               | Compatibility Verdict                      |
| :----------- | :----------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------- |
| `Button`     | `variant="default \| brand \| secondary \| destructive \| outline \| ghost \| link"` | Extended with `primary` and `danger` aliases.                                                                                                             | **100% Backwards Compatible**              |
| `Badge`      | `variant="default \| secondary \| destructive \| outline"`                           | Extended with `primary`, `brand`, `success`, `warning`, `danger`, `info`, `neutral`, and soft variants.                                                   | **100% Backwards Compatible**              |
| `Alert`      | `variant="default \| destructive \| warning \| success"`                             | Extended with `danger` and `info`; migrated from arbitrary Tailwind to semantic tokens.                                                                   | **100% Backwards Compatible**              |
| `Toast`      | `variant="default \| destructive \| warning \| success"`                             | Extended with `danger` and `info`; migrated from arbitrary Tailwind to semantic tokens.                                                                   | **100% Backwards Compatible**              |
| `Sidebar`    | Unapproved brand gradient header                                                     | Branded typography using `text-foreground`.                                                                                                               | **100% Backwards Compatible**              |
| New Controls | N/A                                                                                  | `Textarea`, `Select`, `Checkbox`, `Switch`, `Radio`, `RadioGroup`, `Tabs`, `Separator`, `StatusBadge`, `StatusIndicator` added to `@kinergy-platform/ui`. | **New Capabilities (No Breaking Changes)** |

---

## 4. Accessibility & Verification Evidence

### Automated Test Suites:

- **`@kinergy/ui` Test Suite (`pnpm nx test ui`):**  
  `PASS packages/ui/src/components/__tests__/component-standardization.spec.tsx`  
  `PASS packages/ui/src/components/__tests__/design-system-components.spec.tsx`  
  `PASS packages/ui/src/tokens/__tests__/tokens.spec.ts`  
  `Total: 8 test suites passed, 104 tests passed.`
- **Accessibility Engine:** All components passed automated `axe(container)` tests without violations.
- **Sidebar Integration Suite (`pnpm nx test web --testFile=sidebar.spec.tsx`):**  
  `Total: 1 test suite passed, 10 tests passed.`
- **TypeScript Typecheck (`pnpm typecheck`):**  
  `tsc --noEmit -p tsconfig.base.json` passed with zero errors (`0`).
- **ESLint Checks (`pnpm nx lint ui; pnpm nx lint web`):**  
  `✔ All files pass linting` across all workspace projects.
- **Vite & TS Production Builds (`pnpm nx build ui; pnpm nx build web`):**  
  Successfully transformed 3,034 modules; production assets bundled without errors.

---

## 5. Remaining Component-Level Gaps (Pre-DS-04)

1. **Feature Module Migration:** Individual feature modules currently maintain local ad-hoc status badges (e.g. `PaymentStatusBadge`, `ClientStatusBadge`, `MembershipStatusBadge`). These will be cleanly refactored in DS-04 to consume the new canonical `<StatusBadge />` and `<StatusIndicator />` primitives.
2. **Raw HTML Form Control Replacement:** Instances where feature pages directly render raw `<select>` or `<textarea>` elements will be migrated in DS-04 to `@kinergy-platform/ui` controls (`<Select />`, `<Textarea />`, `<Checkbox />`).
