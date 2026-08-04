# Theme Foundation & Design System Tokens (`apps/web/src/shared/styles/`)

- **Status:** Active / Authoritative Architecture Standard
- **Scope:** `@kinergy-platform/web` (`apps/web/src/shared/styles/`) and Design System (`packages/ui`)
- **Target Application:** Kinergy Platform Web Application Shell & UI Components

---

## 1. Executive Summary & Design Token Philosophy

The **Theme Foundation** establishes the visual design system tokens, Tailwind CSS integration, typography hierarchy, spacing scale, and dark mode persistence for the Kinergy Platform.

Key Principles:

1. **Utility-First with HSL Custom Variables**: Styling uses Tailwind CSS bound to semantic HSL custom variables (`var(--primary)`, `var(--background)`), enabling instant theme switching and dynamic branding.
2. **Zero Hardcoded HEX Colors**: All component styles consume semantic tokens (`bg-background`, `text-foreground`, `border-border`) rather than hardcoded HEX or RGB values.
3. **Dark-Mode First Aesthetic**: Dark mode is the primary platform presentation mode, with full light mode and system preference (`matchMedia`) support.

---

## 2. Design Token Governance

Design tokens are defined in `apps/web/src/shared/styles/globals.css` using HSL values without the `hsl()` wrapper, allowing Tailwind CSS opacity modifiers (`bg-primary/20`, `text-foreground/80`):

| Token Name           | Light Mode Value    | Dark Mode Value     | Usage Description                          |
| :------------------- | :------------------ | :------------------ | :----------------------------------------- |
| `--background`       | `0 0% 100%`         | `224 71% 4%`        | Main view background surface               |
| `--foreground`       | `222.2 84% 4.9%`    | `213 31% 91%`       | Primary body text                          |
| `--card`             | `0 0% 100%`         | `224 71% 7%`        | Elevated card container background         |
| `--popover`          | `0 0% 100%`         | `224 71% 7%`        | Dropdown and modal popover background      |
| `--primary`          | `221.2 83.2% 53.3%` | `210 100% 50%`      | Primary brand call-to-action color         |
| `--secondary`        | `210 40% 96.1%`     | `215 27.9% 16.9%`   | Secondary button and surface color         |
| `--muted`            | `210 40% 96.1%`     | `215 27.9% 16.9%`   | Subtle background for tab bars & skeletons |
| `--muted-foreground` | `215.4 16.3% 46.9%` | `217.9 10.6% 64.9%` | Secondary / caption text color             |
| `--destructive`      | `0 84.2% 60.2%`     | `0 62.8% 30.6%`     | Danger alerts & destructive actions        |
| `--border`           | `214.3 31.8% 91.4%` | `215 27.9% 16.9%`   | Divider and container border color         |
| `--radius`           | `0.5rem`            | `0.5rem`            | Base container border radius               |

---

## 3. Typography Foundation

- **Primary Font Family**: `Inter` (`font-sans`), loaded from Google Fonts with weights `300` (Light), `400` (Regular), `500` (Medium), `600` (SemiBold), `700` (Bold), `800` (ExtraBold).
- **Text Scale Hierarchy**:
  - `text-xs`: `0.75rem` / `1rem` line-height (Captions, timestamps)
  - `text-sm`: `0.875rem` / `1.25rem` line-height (Table data, body secondary)
  - `text-base`: `1rem` / `1.5rem` line-height (Standard body text)
  - `text-lg`: `1.125rem` / `1.75rem` line-height (Sub-section headers)
  - `text-xl`: `1.25rem` / `1.75rem` line-height (Card titles)
  - `text-2xl`: `1.5rem` / `2rem` line-height (Page section headers)
  - `text-3xl`: `1.875rem` / `2.25rem` line-height (Main page titles)
  - `text-4xl`: `2.25rem` / `2.5rem` line-height (Hero metrics)

---

## 4. Theme Provider Usage

To access or toggle themes in any component:

```tsx
import { useTheme } from '@/app/providers';

export const ThemeToggle: React.FC = () => {
  const { theme, resolvedTheme, setTheme } = useTheme();

  return (
    <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
      Current Theme: {theme} (Active: {resolvedTheme})
    </button>
  );
};
```
