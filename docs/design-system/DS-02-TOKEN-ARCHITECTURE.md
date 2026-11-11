# DS-02 — Kinergy Design System: Token Architecture & Centralized Implementation

- **Document ID:** `DS-02-TOKEN-ARCHITECTURE`
- **Milestone:** DS-02 Foundation & Centralized Design Tokens
- **Specification:** `KIN-BRAND-UI-001` (Kinergy Brand & UI Color Specification v1.0)
- **Preceding Audit:** `DS-01-REPOSITORY-AUDIT`
- **Authors:** Principal Frontend Architect & Senior Design Systems Engineer
- **Status:** APPROVED & IMPLEMENTED
- **Target Application:** `@kinergy-platform/ui` (`packages/ui`) & `@kinergy-platform/web` (`apps/web`)

---

## 1. Executive Summary

This architecture document formalizes the centralized design token system implemented during Milestone DS-02. The token engine establishes a single, unambiguous source of truth for all visual presentation across the Kinergy platform monorepo.

By migrating the platform's CSS variables, Tailwind configuration, and TypeScript token contracts to the official Kinergy Brand & UI Color Specification (`KIN-BRAND-UI-001`), the implementation eliminates the 742 literal color smells identified in `DS-01` and resolves all active WCAG 2.2 AA contrast failures.

---

## 2. Token Architecture & Hierarchy

The Kinergy token architecture separates visual attributes into three distinct, non-overlapping abstraction tiers:

```mermaid
graph TD
    subgraph Tier 1: Primitive Tokens
        BRAND[Official Brand Tokens<br/>--kinergy-green: #68CE39<br/>--kinergy-forest: #3F5F25<br/>--kinergy-charcoal: #202522]
        NEUTRAL[Approved Neutrals<br/>--color-white: #FFFFFF<br/>--color-background: #F8FAF9<br/>--color-border: #D8DDD9]
    end

    subgraph Tier 2: Semantic Tokens
        SHADCN[shadcn/ui & Tailwind Semantic Channels<br/>--primary: Forest | --primary-foreground: White<br/>--secondary: Soft | --secondary-foreground: Forest<br/>--foreground: Charcoal | --background: Neutral Canvas]
        STATUS[Semantic Status Tokens<br/>--status-success | --status-warning<br/>--status-danger | --status-info]
        CHART[Data Visualization Tokens<br/>--chart-1 through --chart-5]
    end

    subgraph Tier 3: Component Tokens
        COMP[Presentational Component Primitives<br/>Button, Badge, Card, Input, Alert, Toast, Dialog]
    end

    BRAND --> SHADCN
    NEUTRAL --> SHADCN
    BRAND --> STATUS
    NEUTRAL --> STATUS
    BRAND --> CHART
    SHADCN --> COMP
    STATUS --> COMP
```

### Tier 1: Primitive Brand & Neutral Tokens (Canonical HEX)

- Immutable raw hexadecimal definitions specified in `KIN-BRAND-UI-001`.
- Defined in `packages/ui/src/tokens/tokens.config.ts` and exposed as CSS custom properties in `apps/web/src/shared/styles/globals.css`.
- Components MUST NOT consume primitive tokens directly when semantic abstractions exist.

### Tier 2: Semantic Tokens (HSL Channels & Status Records)

- Purpose-driven mappings that decouple component intent from literal color values.
- Formatted as `H S% L%` triplets without `hsl()` wrappers to allow Tailwind CSS alpha-channel modifier composition (`bg-primary/20`, `text-foreground/80`).
- Mapped into shadcn/ui conventions (`primary`, `secondary`, `destructive`, `muted`, `accent`, `border`, `ring`).

### Tier 3: Component-Level Tokens

- CSS utility classes and CVA variant definitions consumed within `@kinergy-platform/ui` components (`buttonVariants`, `badgeVariants`, `alertVariants`).

---

## 3. Source-of-Truth Locations

To prevent token desynchronization and configuration drift, the repository enforces a strict two-point implementation:

| Responsibility                            | Canonical File Path                                                                                                       |        Format         | Role                                                                        |
| :---------------------------------------- | :------------------------------------------------------------------------------------------------------------------------ | :-------------------: | :-------------------------------------------------------------------------- |
| **TypeScript Contract & Source of Truth** | [`packages/ui/src/tokens/tokens.config.ts`](file:///c:/Projects/kinergy-platform/packages/ui/src/tokens/tokens.config.ts) |  TypeScript Objects   | Programmatic single source of truth for `@kinergy-platform/ui`.             |
| **Type Definitions & Contracts**          | [`packages/ui/src/tokens/tokens.types.ts`](file:///c:/Projects/kinergy-platform/packages/ui/src/tokens/tokens.types.ts)   | TypeScript Interfaces | Compile-time type safety preventing invalid token names.                    |
| **Algorithmic Contrast Engine**           | [`packages/ui/src/tokens/contrast.ts`](file:///c:/Projects/kinergy-platform/packages/ui/src/tokens/contrast.ts)           | TypeScript Utilities  | Pure WCAG relative luminance and contrast calculator.                       |
| **Global Stylesheet Custom Properties**   | [`apps/web/src/shared/styles/globals.css`](file:///c:/Projects/kinergy-platform/apps/web/src/shared/styles/globals.css)   | CSS Custom Properties | Runtime CSS Custom Properties injected into browser DOM.                    |
| **Tailwind Theme Extensions**             | [`apps/web/tailwind.config.js`](file:///c:/Projects/kinergy-platform/apps/web/tailwind.config.js)                         |    Tailwind Config    | Maps Tailwind utilities (`bg-brand`, `bg-status-success`) to CSS variables. |

---

## 4. Tailwind CSS Integration

[`apps/web/tailwind.config.js`](file:///c:/Projects/kinergy-platform/apps/web/tailwind.config.js) is configured to expose the complete token taxonomy:

```javascript
module.exports = {
  darkMode: ['class'],
  theme: {
    extend: {
      colors: {
        // shadcn/ui semantic variables
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },

        // Official Kinergy Brand Tokens
        brand: {
          DEFAULT: 'var(--kinergy-forest)',
          green: 'var(--kinergy-green)',
          forest: 'var(--kinergy-forest)',
          charcoal: 'var(--kinergy-charcoal)',
          soft: 'var(--kinergy-soft)',
          tint: 'var(--kinergy-tint)',
          foreground: 'hsl(var(--brand-foreground, var(--foreground)))',
        },

        // Semantic Status Tokens
        status: {
          success: {
            DEFAULT: 'var(--status-success)',
            foreground: 'var(--status-success-foreground)',
            surface: 'var(--status-success-surface)',
            border: 'var(--status-success-border)',
          },
          warning: {
            DEFAULT: 'var(--status-warning)',
            foreground: 'var(--status-warning-foreground)',
            surface: 'var(--status-warning-surface)',
            border: 'var(--status-warning-border)',
          },
          danger: {
            DEFAULT: 'var(--status-danger)',
            foreground: 'var(--status-danger-foreground)',
            surface: 'var(--status-danger-surface)',
            border: 'var(--status-danger-border)',
          },
          info: {
            DEFAULT: 'var(--status-info)',
            foreground: 'var(--status-info-foreground)',
            surface: 'var(--status-info-surface)',
            border: 'var(--status-info-border)',
          },
        },

        // Chart Tokens
        chart: {
          1: 'var(--chart-1)',
          2: 'var(--chart-2)',
          3: 'var(--chart-3)',
          4: 'var(--chart-4)',
          5: 'var(--chart-5)',
        },
      },
    },
  },
};
```

---

## 5. Component Consumption Examples

### 5.1 Primary Call-to-Action (Forest + White)

```tsx
import { Button } from '@kinergy-platform/ui';

// Primary action: renders bg-primary (Forest #3F5F25) with text-primary-foreground (White #FFFFFF)
// Verified relative luminance contrast: 7.30:1 (Exceeds WCAG AAA)
<Button variant="default">Confirm Appointment</Button>;
```

### 5.2 Signature Brand Action (Green + Charcoal)

```tsx
import { Button } from '@kinergy-platform/ui';

// Signature brand action: renders bg-brand (Green #68CE39) with text-brand-foreground (Charcoal #202522)
// Verified relative luminance contrast: 7.77:1 (Exceeds WCAG AAA)
<Button variant="brand">Upgrade Membership</Button>;
```

### 5.3 Outlined Secondary Action (White + Forest)

```tsx
import { Button } from '@kinergy-platform/ui';

// Outlined action: renders bg-background (White/Neutral) with text-primary & border-input
// Verified relative luminance contrast: 7.30:1
<Button variant="outline">Cancel Changes</Button>;
```

### 5.4 Semantic Status Badge

```tsx
import { Badge } from '@kinergy-platform/ui';
import { CheckCircle2 } from 'lucide-react';

<Badge className="bg-status-success-surface text-status-success border-status-success-border border">
  <CheckCircle2 className="h-3 w-3 mr-1 inline" aria-hidden="true" />
  Active Member
</Badge>;
```

---

## 6. Theme Architecture & Future Extensibility

- **Light Theme (Official v1.0)**: Canonical production aesthetic. All components render with high-contrast surfaces and tested WCAG AA compliance.
- **Dark Theme (Prepared Architecture)**: CSS variables under `.dark` and TypeScript `DARK_SEMANTIC_COLORS` define a clean, non-inverted structure prepared for future design review. Automatic color inversion is strictly prohibited.
- **Theme Provider**: [`apps/web/src/app/providers/theme-provider.tsx`](file:///c:/Projects/kinergy-platform/apps/web/src/app/providers/theme-provider.tsx) sets default theme to `'light'` with persistence in `localStorage('kinergy_theme')`.

---

## 7. Rules for Introducing Additional Tokens

1. **Rule of Three**: Do NOT create a new design token for one-off component styling. A color candidate must appear across at least 3 distinct bounded context modules before standardization.
2. **Mandatory Contrast Verification**: Every new foreground/background token pair must be validated against `packages/ui/src/tokens/contrast.ts` and assert $\ge 4.5:1$ (normal text) or $\ge 3.0:1$ (UI boundaries).
3. **Dual Declaration**: New tokens must be added to `packages/ui/src/tokens/tokens.types.ts`, `tokens.config.ts`, and `apps/web/src/shared/styles/globals.css`.
4. **Automated Test Gate**: Every addition must include a corresponding assertion in `packages/ui/src/tokens/__tests__/tokens.spec.ts`.

---

## 8. Approved Exceptions

The following items are recognized as legitimate exceptions to the semantic token requirement:

- **Third-Party Payment Brand Badges**: Official trademark colors for external payment gateways (Visa, Mastercard, Stripe, QR payment channels) in `apps/web/src/modules/sales/components/payment-method-badge.tsx`.
- **Glassmorphism Backdrop Panels**: The `.glass-panel` utility helper in `globals.css` utilizing semi-transparent dark alpha blurs for modal overlays.

---

## 9. Testing & Quality Gate Evidence

The token infrastructure is guarded by automated test suites in `packages/ui`:

```
 PASS   ui  packages/ui/src/tokens/__tests__/tokens.spec.ts
  Kinergy Design System Token Engine & Contract Verification
    1. Official Brand & Approved Neutral Tokens (Exact Values)
      √ preserves exact official brand HEX values per KIN-BRAND-UI-001 (3 ms)
      √ preserves exact approved neutral HEX values per KIN-BRAND-UI-001 (1 ms)
    2. Semantic Status & Chart Tokens Presence
      √ defines complete semantic status scales for success, warning, danger, and info (2 ms)
      √ defines complete chart visualization tokens (1 ms)
      √ defines complete interaction state tokens (1 ms)
    3. WCAG Relative Luminance & Contrast Calculation Utility
      √ normalizes valid 6-digit and 3-digit HEX colors correctly (2 ms)
      √ rejects invalid or malformed HEX color inputs with descriptive error (2 ms)
      √ parses HEX to RGB components correctly (1 ms)
      √ calculates relative luminance accurately according to W3C formula (1 ms)
      √ calculates canonical extreme contrast ratios correctly (1 ms)
    4. Mandatory Action & Semantic Contrast Compliance (WCAG 2.2 AA)
      √ validates Primary Action: White (#FFFFFF) on Forest (#3F5F25) achieves >= 4.5:1 (passes AAA >= 7.0:1) (1 ms)
      √ validates Brand Action: Charcoal (#202522) on Green (#68CE39) achieves >= 4.5:1 (passes AAA >= 7.0:1) (1 ms)
      √ validates Outlined Action: Forest (#3F5F25) on White (#FFFFFF) achieves >= 4.5:1 (passes AAA >= 7.0:1) (1 ms)
      √ validates Outlined Action on Application Background: Forest (#3F5F25) on Background (#F8FAF9) achieves >= 4.5:1 (1 ms)
      √ validates Body Text: Charcoal (#202522) on Background (#F8FAF9) achieves >= 4.5:1 (passes AAA >= 7.0:1) (1 ms)
      √ validates Secondary Text: Text Secondary (#68716B) on Background (#F8FAF9) achieves >= 4.5:1 (1 ms)
      √ validates all semantic status badge pairings satisfy WCAG 2.2 AA (>= 4.5:1) (2 ms)
    5. CSS Custom Properties Consistency Verification
      √ verifies globals.css declares all canonical brand and neutral variables (3 ms)
      √ verifies LIGHT_SEMANTIC_COLORS correctly maps Primary to Forest and PrimaryForeground to White (1 ms)
      √ verifies root DESIGN_TOKENS references the canonical brand and neutral sets (1 ms)

Test Suites: 7 passed, 7 total
Tests:       73 passed, 73 total
Time:        6.756 s
```

---

## 10. GO / NO-GO Assessment for Phase DS-03

### Status: **GO FOR DS-03**

#### Technical Justification:

1. **Foundation Solidified**: Canonical brand tokens (`#68CE39`, `#3F5F25`, `#202522`, `#E5F6D9`, `#F4FAEF`) and approved neutrals are implemented, tested, and bound to CSS variables and Tailwind utilities.
2. **Zero Regressions**: All 7 test suites (73 tests) in `@kinergy-platform/ui` pass. Web application integration tests pass cleanly.
3. **WCAG Compliance Baseline**: Interactive actions achieve verified contrast ratios between 7.30:1 and 7.77:1 (exceeding WCAG AAA).
4. **Ready for Component Upgrade**: The platform is prepared to migrate core shared UI components (`Button`, `Badge`, `Alert`, `Toast`, and missing form controls) in Phase DS-03.
