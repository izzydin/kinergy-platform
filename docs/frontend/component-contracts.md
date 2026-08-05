# Component Architecture Contracts (`docs/frontend/component-contracts.md`)

- **Status:** Active / Authoritative Architectural Standard
- **Scope:** `@kinergy-platform/ui` (`packages/ui/`), `@kinergy-platform/web` (`apps/web/src/shared/components/` & `apps/web/src/modules/*/components/`)
- **Target Application:** Kinergy Platform Frontend Component Engineering Standard

---

## 1. Overview & Architectural Purpose

The **Component Architecture Contracts** define the mandatory design, API, styling, accessibility, composition, and testability standards that every UI component MUST satisfy across the Kinergy Platform.

These contracts ensure that all atomic primitives (`packages/ui`), shared application components (`apps/web/src/shared/components`), and domain feature components (`apps/web/src/modules/*/components`) adhere to uniform, predictable, and production-ready interfaces.

---

## 2. Public API Design Contract

### A. Prop Naming Standard

1. **Native HTML Attributes**: Keep standard native HTML attribute names (`disabled`, `required`, `checked`, `selected`, `type`, `autoFocus`, `readOnly`, `placeholder`, `value`, `name`, `id`). Never prefix or rename native HTML attributes (e.g. use `disabled`, NOT `isDisabled` for native elements).
2. **Custom Boolean Props**: Custom boolean props MUST use semantic boolean prefixes:
   - `isLoading`: Indicates active asynchronous loading / pending status.
   - `isInvalid` / `hasError`: Indicates validation error state.
   - `isOpen`: Controls open/closed visual visibility (modals, dropdowns, popovers).
   - `isDisabled`: Used only when wrapping composite components that pass down disabled states.
   - `isFullWidth`: Controls full container width stretching.
3. **Event Handler Naming**:
   - Callbacks MUST start with `on` followed by a verb in camelCase (`onClick`, `onChange`, `onSelect`, `onToggle`, `onClose`, `onOpenChange`, `onSearch`).
   - Handler implementations inside components MUST start with `handle` (`handleClick`, `handleChange`, `handleSelect`).
4. **Variant Naming Standard**:
   - Primary variants: `variant="default"`, `variant="secondary"`, `variant="destructive"`, `variant="outline"`, `variant="ghost"`, `variant="link"`.
   - Never invent component-specific variant names for standard actions (e.g. do NOT use `variant="dangerButton"` or `type="red"`).
5. **Size Naming Standard**:
   - Standard size scale: `sm`, `md`, `lg`, `xl`, `icon`.
   - Default size for all interactive components is `md`.

---

## 3. Component Composition Contract

### A. Ref Forwarding Requirement

Every presentational and interactive component MUST expose its underlying DOM node via ref forwarding (`React.forwardRef` or standard React ref forwarding). This enables focus management, animations, tooltips, and third-party library integrations.

### B. Polymorphic `asChild` Composition Pattern

Components that render interactive wrappers (e.g., `<Button>`, `<Badge>`, `<Card>`) MUST support the `asChild` composition pattern (powered by `@radix-ui/react-slot` Slot primitive).

- **Purpose**: Enables rendering alternative elements (e.g., React Router `<Link>`, external `<a>` tags, custom buttons) while retaining all component styles, variants, accessibility attributes, and event handlers without prop duplication.

```tsx
// Good: Polymorphic link composition using asChild
<Button asChild variant="default" size="md">
  <Link to="/dashboard">Go to Dashboard</Link>
</Button>

// Poor: Component-specific link props (Forbidden)
<Button isLink href="/dashboard">Go to Dashboard</Button>
```

---

## 4. Style Composition Contract

### A. `className` Acceptance

Every component MUST accept an optional `className?: string` prop.

### B. Mandatory `cn()` Style Merging

All component class names MUST be merged using the platform's standard `cn()` utility (`clsx` + `tailwind-merge`).

- **Forbidden**: Manual string concatenation (`className + ' ' + customClass`).
- **Mandatory Composition Order**:
  1. Base component styles
  2. Variant & size styles (CVA / class variance authority)
  3. Conditional state styles (`isInvalid ? 'border-destructive' : ''`)
  4. Consumer `className` overrides

```tsx
// Standard Style Composition Pattern
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
    );
  },
);
```

---

## 5. Design Token Enforcement Contract

### A. Strict Token Isolation

Components MUST NEVER expose arbitrary visual styling props such as `color="#ff0000"`, `background="#000"`, or `fontSize={16}`.

### B. Forbidden Inline Styles

Inline `style={{ ... }}` props are strictly forbidden unless required by dynamic runtime data (e.g. chart coordinates, user-uploaded avatar positions, virtualized list offsets).

### C. Theme Engine Flow

Visual styling MUST flow strictly through:

1. Semantic design tokens (HSL CSS variables: `var(--primary)`, `var(--background)`, `var(--foreground)`, `var(--muted)`, `var(--border)`).
2. Variant CVA mappings.
3. Tailwind CSS utility classes.

This guarantees instant dark mode support and dynamic multi-tenant brand customization.

---

## 6. Accessibility (a11y) Contract

### A. Mandatory Expectations

Every component MUST fulfill the WAI-ARIA specification out-of-the-box:

1. **Keyboard Support**: Full navigation via `Tab`, `Shift+Tab`, `Enter`, `Space`, `Escape`, and Arrow keys.
2. **Focus Visibility**: Every focusable element MUST display high-contrast focus rings (`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`).
3. **Semantic HTML**: Use native semantic HTML elements (`<button>`, `<input>`, `<nav>`, `<header>`, `<main>`, `<article>`, `<aside>`) over generic `<div>` clickables.
4. **ARIA State Attributes**: Expose explicit ARIA attributes (`aria-expanded`, `aria-checked`, `aria-selected`, `aria-invalid`, `aria-describedby`, `aria-label`).
5. **Accessible Loading States**: Components in a loading state MUST set `aria-busy="true"` and include visually hidden screen reader announcements (`<span className="sr-only">Loading...</span>`).

---

## 7. Extensibility & Boundary Contract

### A. Favor Composition Over Configuration

Avoid creating monolithic "mega-components" with dozens of boolean flags (e.g. `showFooter`, `hasHeader`, `withSearch`). Instead, compose sub-components:

```tsx
// Good Extension: Compound Component Composition
<Card>
  <Card.Header>
    <Card.Title>Account Settings</Card.Title>
  </Card.Header>
  <Card.Body>
    <UserSettingsForm />
  </Card.Body>
</Card>

// Poor Extension: Config Flag Bloat (Forbidden)
<Card title="Account Settings" showHeader={true} showBody={true} bodyContent={<UserSettingsForm />} />
```

### B. Component Architectural Boundaries

Components MUST strictly respect architectural boundaries:

| Component Category                                 | Owns Presentational UI | Owns Interaction & a11y | Owns Domain Types / APIs | Owns App Routing / Auth |
| :------------------------------------------------- | :--------------------: | :---------------------: | :----------------------: | :---------------------: |
| **Atomic Primitives (`packages/ui`)**              |        **YES**         |         **YES**         |          **NO**          |         **NO**          |
| **Shared Components (`apps/web/src/shared`)**      |        **YES**         |         **YES**         |          **NO**          |         **NO**          |
| **Domain Components (`src/modules/*/components`)** |        **YES**         |         **YES**         |         **YES**          |         **NO**          |
| **View Pages (`src/modules/*/presentation`)**      |        **YES**         |         **YES**         |         **YES**          |         **YES**         |

---

## 8. Testability Contract

Every interactive component MUST be testable using standard `@testing-library/react` queries:

1. **User Interaction Testing**: Verify state changes via real user actions (`fireEvent` / `userEvent`).
2. **Accessibility-First Queries**: Select elements via `getByRole('button', { name: /submit/i })`, `getByLabelText`, or `getByText` rather than internal test IDs or CSS selectors.
3. **Behavioral Assertions**: Assert on DOM state (`toBeDisabled()`, `toHaveAttribute('aria-expanded', 'true')`) rather than component internal implementation state.

---

## 9. Cross-References & Related Documentation

- [Frontend UI Architecture & Design System Strategy](./ui-architecture.md)
- [Frontend Architecture Vision](./architecture.md)
- [Frontend Engineering Principles](./principles.md)
- [Frontend Folder Structure & Architectural Boundaries](./folder-structure.md)
- [Frontend Testing Strategy & Quality Assurance Architecture](./testing.md)
- [Master Platform Documentation Index](../README.md)
