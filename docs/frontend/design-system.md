# Frontend Design System Specification & Usage Guide (@kinergy-platform/ui)

- **Status**: APPROVED & MANDATORY
- **Scope**: Entire Kinergy Platform Frontend Monorepo
- **Package**: `@kinergy-platform/ui` (`packages/ui`)
- **Architectural Owners**: Lead Frontend Architect & Design System Guild

---

## 1. Component Philosophy & Architectural Principles

The `@kinergy-platform/ui` design system provides presentational primitives and foundations for the Kinergy Platform. Every presentational component in the repository adheres to six non-negotiable principles:

1. **Token-Driven Styling**: Visual styling is strictly governed by CSS Custom Properties (tokens) defined in `packages/ui/src/tokens/tokens.config.ts`. No ad-hoc hex codes (`#1a202c`) or arbitrary tailwind values (`w-[133px]`) are permitted.
2. **Composition over Configuration**: Prefer compound sub-components (`<DialogHeader>`, `<DialogTitle>`, `<DialogContent>`) and polymorphic slots (`asChild`) over monolithic components configured with dozens of boolean flags.
3. **Strict Domain Isolation**: Design system components are presentational primitives. They MUST NOT contain business logic, domain entities, HTTP fetching, state management stores, or feature-specific knowledge.
4. **WAI-ARIA Accessibility First**: Built-in keyboard navigation, focus management, high-contrast focus rings (`focus-visible:ring-2`), ARIA roles, and screen reader announcements out-of-the-box.
5. **Headless Radix Primitives + Tailwind CSS Engine**: Complex interactive primitives (modals, toasts, slots) wrap unstyled Radix UI primitives, formatted using Tailwind CSS utility classes and `class-variance-authority` (`cva`).
6. **Polymorphic Node Safety**: Interactive components use `Radix Slot` (`asChild`) to delegate DOM node rendering without creating extra wrapper `<div>` nodes that pollute HTML hierarchy.

---

## 2. Public API Reference & Component Catalog

### 2.1 Primitive Components

#### `<Button>`

Presents interactive action triggers. Supports standard variant and size scales, loading states, and polymorphic slot composition.

- **Props**: `variant` (`default`, `destructive`, `outline`, `secondary`, `ghost`, `link`), `size` (`default`, `sm`, `lg`, `icon`), `isLoading` (`boolean`), `loadingText` (`string`), `asChild` (`boolean`).
- **WAI-ARIA**: `role="button"`, `aria-busy={isLoading}`.

```tsx
import { Button } from '@kinergy-platform/ui';

<Button variant="default" size="md" isLoading={isSubmitting} loadingText="Saving...">
  Save Changes
</Button>;
```

#### `<Input>`

Single-line text input presentational primitive with error state ring styling and ref forwarding.

- **Props**: Native `React.InputHTMLAttributes<HTMLInputElement>`, `isInvalid` (`boolean`).
- **WAI-ARIA**: `aria-invalid={isInvalid}`.

```tsx
import { Input } from '@kinergy-platform/ui';

<Input type="email" placeholder="user@domain.com" isInvalid={!!error} />;
```

#### `<Badge>`

Compact status indicator badge.

- **Props**: `variant` (`default`, `secondary`, `destructive`, `outline`), `size` (`sm`, `md`), `asChild` (`boolean`).

```tsx
import { Badge } from '@kinergy-platform/ui';

<Badge variant="destructive">Action Required</Badge>;
```

#### `<Avatar>`

User profile avatar container featuring an automated fallback sequence when image resources fail to load.

- **Sub-components**: `Avatar`, `AvatarImage`, `AvatarFallback`.

```tsx
import { Avatar, AvatarImage, AvatarFallback } from '@kinergy-platform/ui';

<Avatar>
  <AvatarImage src={user.avatarUrl} alt={user.name} />
  <AvatarFallback>{user.initials}</AvatarFallback>
</Avatar>;
```

---

### 2.2 Form Primitives

#### `<PasswordInput>`

Specialized password field with built-in accessibility toggle button to show or hide plain text password.

- **WAI-ARIA**: Toggle button announces `aria-label="Show password"` or `"Hide password"` to screen readers.

```tsx
import { PasswordInput } from '@kinergy-platform/ui';

<PasswordInput placeholder="Enter secure password" />;
```

#### `<FormField>` Suite

Compound form layout field providing automated ID linkage between `<FormLabel>`, `<Input>`, `<FormHelperText>`, and `<FormErrorMessage>`.

```tsx
import {
  FormField,
  FormLabel,
  FormControl,
  FormHelperText,
  FormErrorMessage,
  Input,
} from '@kinergy-platform/ui';

<FormField controlId="user-email" isInvalid={!!errors.email}>
  <FormLabel required>Email Address</FormLabel>
  <FormControl>
    <Input type="email" placeholder="john@example.com" />
  </FormControl>
  <FormHelperText>We will send account notifications here.</FormHelperText>
  {errors.email && <FormErrorMessage>{errors.email.message}</FormErrorMessage>}
</FormField>;
```

---

### 2.3 Feedback Primitives

#### `<Spinner>`

Accessible SVG loading spinner indicator.

- **Props**: `size` (`sm`, `md`, `lg`, `xl`), `label` (`string`).
- **WAI-ARIA**: `role="status"`, `aria-busy="true"`, `sr-only` label span.

#### `<Skeleton>`

Content placeholder shimmer animation for loading states.

- **WAI-ARIA**: `aria-hidden="true"`.

#### `<Alert>`

Contextual feedback box for info, warning, success, and error messages.

- **Sub-components**: `Alert`, `AlertTitle`, `AlertDescription`.
- **WAI-ARIA**: `role="alert"`.

#### `<Toast>` Suite

Notification banner system rendered into `<ToastViewport>`.

- **Sub-components**: `ToastProvider`, `ToastViewport`, `Toast`, `ToastTitle`, `ToastDescription`, `ToastClose`, `ToastAction`.
- **WAI-ARIA**: `aria-live="polite"` (`default`) or `"assertive"` (`destructive`).

---

### 2.4 Overlay Components

#### `<Dialog>` Suite

Portal-teleported accessible modal overlay backed by Radix UI primitive foundations.

- **Sub-components**: `Dialog`, `DialogTrigger`, `DialogPortal`, `DialogOverlay`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, `DialogClose`.
- **Accessibility & Features**: Focus trapping, Escape key close listener, focus restoration to trigger, body scroll lock, `role="dialog"`, `aria-modal="true"`.

```tsx
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  Button,
} from '@kinergy-platform/ui';

<Dialog>
  <DialogTrigger asChild>
    <Button variant="outline">Open Settings</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>User Settings</DialogTitle>
      <DialogDescription>Manage your workspace preference parameters.</DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <DialogClose asChild>
        <Button variant="secondary">Cancel</Button>
      </DialogClose>
      <Button>Save Settings</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>;
```

---

## 3. Theming & Design Tokens Integration

The design system is powered by CSS Custom Properties defined in `packages/ui/src/tokens/tokens.config.ts`. Themes are toggled by applying the `.dark` CSS class to the root `<html>` or `<body>` element.

```css
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 210 40% 98%;
  --border: 214.3 31.8% 91.4%;
  --ring: 222.2 84% 4.9%;
}

.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  --primary: 210 40% 98%;
  --primary-foreground: 222.2 47.4% 11.2%;
  --destructive: 0 62.8% 30.6%;
  --destructive-foreground: 210 40% 98%;
  --border: 217.2 32.6% 17.5%;
  --ring: 212.7 26.8% 83.9%;
}
```

Components consume tokens through semantic utility classes (e.g., `bg-background`, `text-foreground`, `border-border`, `ring-ring`).

---

## 4. Extension Rules & Customization

1. **Utility Merging via `cn()`**:
   Every presentational component accepts a `className` prop, merged safely using `clsx` and `tailwind-merge` (`cn()`):

   ```tsx
   <Button className="w-full sm:w-auto shadow-md">Submit</Button>
   ```

2. **Adding New Variants**:
   Extend variant definitions in `packages/ui/src/primitives/variants.ts` using `cva`:

   ```ts
   export const buttonVariants = cva('...', {
     variants: {
       variant: {
         default: '...',
         brand: 'bg-brand text-brand-foreground hover:bg-brand/90',
       },
     },
   });
   ```

3. **Polymorphic Slot Composition (`asChild`)**:
   Use `asChild` when a component needs to render as a Router `<Link>`, external `<a>`, or custom element without inserting a wrapper element:
   ```tsx
   <Button asChild variant="link">
     <a href="https://docs.kinergy.com">Documentation</a>
   </Button>
   ```

---

## 5. Anti-Patterns & Prohibited Code Smells

❌ **NEVER Hardcode Raw Color Hex Codes or Off-Token Sizes**:

```tsx
/* BAD */ <div className="bg-[#1e293b] text-[#f8fafc] p-[13px]">
/* GOOD */ <div className="bg-card text-card-foreground p-4">
```

❌ **NEVER Embed Domain Logic, Queries, or API Calls in `@kinergy-platform/ui`**:

```tsx
/* BAD */ export function UserProfileButton() { const user = useUserQuery(); return ... }
/* GOOD */ Presentational components consume data strictly via props.
```

❌ **NEVER Break Accessibility Contracts**:

```tsx
/* BAD */ <div onClick={handleClick}>Click Me</div>
/* GOOD */ <Button onClick={handleClick}>Click Me</Button>
```

❌ **NEVER Create Monolithic Configurable Components**:

```tsx
/* BAD */ <Modal showTitle showHeader title="Title" hasCancel cancelText="No" hasConfirm confirmText="Yes" />
/* GOOD */ Use Compound Component Composition (<Dialog>, <DialogContent>, <DialogHeader>, <DialogTitle>, <DialogFooter>).
```

---

## 6. Cross-References & Architectural Decision Records

- **`ADR-FE-0021`**: Presentational UI Component Architecture & Contract Standards ([ui-architecture.md](./ui-architecture.md#ADR-FE-0021))
- **`ADR-FE-0022`**: Design Token Architecture & CSS Variable Engine ([ui-architecture.md](./ui-architecture.md#ADR-FE-0022))
- **`ADR-FE-0023`**: Headless Primitive Foundation & Radix UI Integration ([ui-architecture.md](./ui-architecture.md#ADR-FE-0023))
- **`ADR-FE-0024`**: Form Field Composition Architecture ([ui-architecture.md](./ui-architecture.md#ADR-FE-0024))
- **`ADR-FE-0025`**: Loading UX & State View Standard ([ui-architecture.md](./ui-architecture.md#ADR-FE-0025))
- **`ADR-FE-0026`**: Notification Banner Architecture ([ui-architecture.md](./ui-architecture.md#ADR-FE-0026))
- **`ADR-FE-0027`**: Accessible Modal Overlay Architecture ([ui-architecture.md](./ui-architecture.md#ADR-FE-0027))
- **Component Contracts**: [component-contracts.md](./component-contracts.md)
