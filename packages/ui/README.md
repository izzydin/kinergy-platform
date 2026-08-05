# `@kinergy-platform/ui`

Shared Primitive UI Component Library & Design System Foundation for the Kinergy Platform.

---

## 1. Overview & Architecture

`@kinergy-platform/ui` provides pure, presentational, accessibility-compliant primitive components and design system tokens.

### Architectural Rules & Responsibilities:

- **Presentation & Interaction Only**: Primitive components strictly own rendering, keyboard navigation, focus management, and WAI-ARIA states.
- **Zero Domain Dependencies**: Primitives MUST NOT import domain DTOs, API hooks, state stores, or route guards.
- **Contract Enforcement**: Every primitive implements [Component Architecture Contracts](../../docs/frontend/component-contracts.md) (DOM ref forwarding, `cn()` style composition, polymorphic `asChild` rendering via `Slot`, and semantic HSL design tokens).

---

## 2. Primitive Component Catalog (Milestone A4.2)

| Component           | Responsibility / Scope                                                 | Key Props / Extension                                                                                                                        | Polymorphic `asChild` |
| :------------------ | :--------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------: |
| **`Button`**        | Accessible, theme-aware trigger control                                | `variant` (`default`, `secondary`, `destructive`, `outline`, `ghost`, `link`), `size` (`sm`, `md`, `lg`, `icon`), `isLoading`, `loadingText` |        **YES**        |
| **`Input`**         | Theme-aware native text input control                                  | `type`, `placeholder`, `disabled`, `isInvalid` (sets `aria-invalid="true"` & red border)                                                     |        **NO**         |
| **`PasswordInput`** | Password input primitive with accessible show/hide toggle              | `disabled`, `isInvalid`, native input props                                                                                                  |        **NO**         |
| **`FormField`**     | Form field composition container providing context IDs & accessibility | Sub-components: `FormField`, `FormLabel`, `FormControl`, `FormHelperText`, `FormErrorMessage`                                                |        **NO**         |
| **`Card`**          | Compound content container primitive                                   | Sub-components: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`                                            |        **NO**         |
| **`Avatar`**        | User profile avatar container with image load error fallback           | Sub-components: `Avatar`, `AvatarImage`, `AvatarFallback`                                                                                    |        **NO**         |
| **`Badge`**         | Compact status indicator primitive                                     | `variant` (`default`, `secondary`, `destructive`, `outline`), `size` (`sm`, `md`)                                                            |        **YES**        |
| **`Alert`**         | Accessible WAI-ARIA status alert (`role="alert"`)                      | Sub-components: `Alert`, `AlertTitle`, `AlertDescription`. Variants: `default`, `destructive`, `warning`, `success`                          |        **NO**         |

---

## 3. Style & Token Composition Pattern

All components merge styles via the platform's standard `cn()` utility:

```tsx
import { Button, Input, Card, CardHeader, CardTitle, CardContent } from '@kinergy-platform/ui';

export function ExampleForm() {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Sign In</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input placeholder="Email address" type="email" />
        <Button variant="default" size="md" isFullWidth>
          Continue
        </Button>
      </CardContent>
    </Card>
  );
}
```

---

## 4. Quality Gates & Validation

Run quality gate commands:

```bash
pnpm nx test ui
pnpm nx lint ui
pnpm nx build ui
```
