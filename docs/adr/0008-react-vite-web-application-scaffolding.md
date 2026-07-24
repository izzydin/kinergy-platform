# 8. React + Vite Application Scaffolding in `apps/web`

- **Status:** Accepted
- **Date:** 2026-07-24

## Context and Problem Statement

The Kinergy Platform requires a modern, responsive frontend application for energy dashboard visualization, system configuration, and monitoring.

## Decision Drivers

- Fast HMR development and production bundling via Vite.
- Declarative client-side routing via React Router.
- Robust server state management, caching, and background refetching via TanStack Query.
- Utility-first styling with custom HSL design tokens, Tailwind CSS, and shadcn/ui helpers (`clsx` + `tailwind-merge`).
- Type-safe form orchestration via React Hook Form and Zod validation schemas.

## Decision Outcome

Chosen Option: **React 18 Application in `apps/web` using Vite, Tailwind CSS, TanStack Query, and React Router**.

### Architecture Specifications

1. **Vite & Nx Integration (`vite.config.ts`, `project.json`)**:
   - Building via `@nx/vite:build` outputting to `dist/apps/web`.
   - Path aliasing (`@/*` -> `src/*`).
2. **Design System (`src/styles/globals.css`, `tailwind.config.js`, `src/lib/utils.ts`)**:
   - CSS custom variables defining HSL theme palette.
   - `cn()` helper function for class merging.
3. **Application Providers & Routing (`src/providers/app-provider.tsx`, `src/routes/app-router.tsx`)**:
   - `QueryClientProvider` wrapping `BrowserRouter`.
   - `MainLayout` shell component rendering header, main view outlet, and footer.
4. **Folder Conventions (`apps/web/src/`)**:
   - `components/`: UI components and design primitives.
   - `features/`: Isolated feature modules.
   - `hooks/`: Custom React hooks.
   - `layouts/`: Application layout shells.
   - `lib/`: Utility functions and third-party client instantiations.
   - `providers/`: Context provider wrappers.
   - `routes/`: Routing tables and view compositions.
   - `styles/`: Global stylesheets and theme declarations.
   - `types/`: Frontend specific type definitions.

## Consequences

### Positive

- High developer productivity with Vite HMR and TypeScript integration.
- Standardized UI utility pattern ready for shadcn/ui component generation.
- Zero business page pollution in the baseline scaffold.
