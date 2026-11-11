# Theme Foundation & Design System Tokens (`apps/web/src/shared/styles/`)

- **Status:** Active / Authoritative Architecture Standard (KIN-BRAND-UI-001 v1.0)
- **Scope:** `@kinergy-platform/web` (`apps/web/src/shared/styles/`) and Design System (`packages/ui`)
- **Target Application:** Kinergy Platform Web Application Shell & UI Components

---

## 1. Executive Summary & Design Token Philosophy

The **Theme Foundation** establishes the visual design system tokens, Tailwind CSS integration, typography hierarchy, spacing scale, and theme persistence for the Kinergy Platform.

Key Principles:

1. **Official Brand Integrity**: Built upon canonical Kinergy Brand Tokens (`--kinergy-green: #68CE39`, `--kinergy-forest: #3F5F25`, `--kinergy-charcoal: #202522`, `--kinergy-soft: #E5F6D9`, `--kinergy-tint: #F4FAEF`) and approved neutrals.
2. **Light-Theme First (Official v1.0)**: Light mode is the canonical production aesthetic with WCAG 2.2 AA / AAA contrast validation. Clean architecture prepared for future dark theme without unapproved auto-inversion.
3. **Utility-First with HSL Custom Variables**: Styling uses Tailwind CSS bound to semantic HSL custom variables (`var(--primary)`, `var(--background)`), enabling instant theme switching and dynamic branding.
4. **Zero Hardcoded Ad-Hoc Colors**: All component styles consume semantic tokens (`bg-primary`, `text-primary-foreground`, `bg-brand`, `border-border`, `bg-status-success`) rather than literal colors.

---

## 2. Design Token Governance

### 2.1 Official Brand & Approved Neutral Tokens (HEX)

```css
/* Canonical Brand Tokens */
--kinergy-green: #68ce39;
--kinergy-forest: #3f5f25;
--kinergy-charcoal: #202522;
--kinergy-soft: #e5f6d9;
--kinergy-tint: #f4faef;

/* Approved Neutral Tokens */
--color-white: #ffffff;
--color-background: #f8faf9;
--color-border: #d8ddd9;
--color-text-secondary: #68716b;
```

### 2.2 Semantic HSL Channels (shadcn/ui & Tailwind Integration)

Design tokens are defined in `apps/web/src/shared/styles/globals.css` and `packages/ui/src/tokens/tokens.config.ts`:

| Token Name               | Light Mode HSL      | Rendered Value | Usage Description                                            |
| :----------------------- | :------------------ | :------------- | :----------------------------------------------------------- |
| `--background`           | `150 16.7% 97.6%`   | `#F8FAF9`      | Main view background surface                                 |
| `--foreground`           | `144 7.2% 13.5%`    | `#202522`      | Primary body text (Charcoal)                                 |
| `--card`                 | `0 0% 100%`         | `#FFFFFF`      | Elevated card container background                           |
| `--popover`              | `0 0% 100%`         | `#FFFFFF`      | Dropdown and modal popover background                        |
| `--primary`              | `93.1 43.9% 25.9%`  | `#3F5F25`      | Primary brand action (Forest) -> 7.30:1 contrast             |
| `--primary-foreground`   | `0 0% 100%`         | `#FFFFFF`      | Primary action foreground (White)                            |
| `--brand`                | `101.1 60.3% 51.6%` | `#68CE39`      | Brand accent action (Green) -> 7.77:1 contrast with Charcoal |
| `--brand-foreground`     | `144 7.2% 13.5%`    | `#202522`      | Brand action foreground (Charcoal)                           |
| `--secondary`            | `95.2 61.7% 90.8%`  | `#E5F6D9`      | Secondary button and surface (Soft)                          |
| `--secondary-foreground` | `93.1 43.9% 25.9%`  | `#3F5F25`      | Secondary action text (Forest) -> 6.44:1 contrast            |
| `--muted`                | `92.7 52.4% 95.9%`  | `#F4FAEF`      | Subtle background for tab bars & skeletons (Tint)            |
| `--muted-foreground`     | `140 4.1% 42.5%`    | `#68716B`      | Secondary / caption text (Text Secondary) -> 4.81:1 contrast |
| `--destructive`          | `0 72% 51%`         | `#DC2626`      | Danger alerts & destructive actions                          |
| `--border`               | `132 6.8% 85.7%`    | `#D8DDD9`      | Divider and container border color                           |
| `--radius`               | `0.5rem`            | `8px`          | Base container border radius                                 |

---

## 3. Typography Foundation

- **Primary Font Family**: `Inter` (`font-sans`), loaded from Google Fonts with weights `300`, `400`, `500`, `600`, `700`, `800`.
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
