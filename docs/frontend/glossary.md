# Frontend Architecture & Technical Glossary

- **Status:** Active / Terminology Baseline
- **Scope:** Frontend Workspace (`apps/web`, `packages/*`)
- **Parent Glossary:** [Platform Master Glossary](../glossary.md)

---

## 1. Architectural & Pattern Terminology

| Term                                 | Category          | Definition                                                                                                                                               |
| :----------------------------------- | :---------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bounded Context Mirroring**        | Architecture      | Strategic alignment pattern where frontend feature directories (`features/<domain>`) mirror backend Domain-Driven Design (DDD) bounded contexts 1:1.     |
| **Feature-First Architecture**       | Directory Pattern | Structuring frontend code by domain features rather than technical layers (grouping components, hooks, routes, forms, and tests inside feature folders). |
| **Hybrid Feature Routing**           | Routing           | Pattern where a central router shell handles layout nesting while individual feature modules define and export their own co-located sub-routes.          |
| **Public API Boundary (`index.ts`)** | Enforce Boundary  | Explicit export file at the root of a feature module (`features/<feature>/index.ts`) defining the only exposed surface accessible by external modules.   |
| **Just-In-Time Abstraction**         | Design Principle  | Engineering rule mandating that shared abstractions, hooks, or generic components are built only after 3+ real-world use cases exist.                    |
| **Composition Over Inheritance**     | Component Design  | React pattern prioritizing slot composition (`children`, render props) over rigid configuration props or component inheritance hierarchy.                |
| **Design Tokens**                    | Styling           | Centralized CSS custom variables defining color channels (HSL), typography, spacing, and shadows across light and dark themes.                           |
| **DTO Mapper**                       | Data Pipeline     | Pure transformer function mapping raw backend API DTOs into structured, client-optimized UI view models.                                                 |
| **Presenter Pattern**                | Presentation      | Decoupling data fetching hooks from visual layout components, enabling rendering components without API side-effects.                                    |

---

## 2. State Management Taxonomy

| Term                   | Category       | Primary Tool               | Definition                                                                                                                                               |
| :--------------------- | :------------- | :------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Server State**       | State Taxonomy | TanStack Query             | Asynchronous data residing on backend servers (user profiles, energy telemetry, client records). Requires caching, background updates, and invalidation. |
| **URL State**          | State Taxonomy | React Router Query Params  | State reflected directly in the browser URL query string (search queries, filters, sorting order, pagination offset). Enables bookmarkable views.        |
| **Form State**         | State Taxonomy | React Hook Form + Zod      | Transient user input state buffered during form editing prior to validation and API submission.                                                          |
| **Transient UI State** | State Taxonomy | React `useState` / Context | Temporary visual UI interaction states (modal open/close state, dropdown menu toggles, expanded accordion panels).                                       |

---

## 3. Mandatory 4-State UI Specification

| State                  | Purpose & UX Expectation                                                     | Visual Representation                                                                                                    |
| :--------------------- | :--------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------- |
| **1. Loading State**   | Initial or background data resolution. Prevents jarring layout shifts.       | Skeleton loader cards, pulsing text placeholders, or progress indicators matching final UI layout bounds.                |
| **2. Empty State**     | Successful API query execution returning zero records (`data.length === 0`). | Friendly graphic/icon, clear contextual explanation message, and an actionable CTA button (e.g., "Create First Record"). |
| **3. Error State**     | Unhandled network failure, 5xx server error, or 4xx permission failure.      | Non-destructive alert card, clear error message explanation, and an interactive "Retry" trigger button.                  |
| **4. Populated State** | Successful API query execution returning active data.                        | Full data view rendering interactive lists, tables, charts, pagination controls, and action menus.                       |

---

## 4. Technical Tools & Abstractions

| Term / Library                               | Purpose in Platform                                                                                                                        |
| :------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------- |
| **TanStack Query** (`@tanstack/react-query`) | Asynchronous server state engine handling fetching, caching, deduplication, optimistic UI updates, and cache invalidation.                 |
| **React Hook Form** (`react-hook-form`)      | High-performance, un-controlled form orchestration library minimizing unnecessary component re-renders during user input.                  |
| **Zod** (`zod`)                              | TypeScript-first schema declaration and validation library used for form validation resolvers and runtime environment variable validation. |
| **Vite** (`vite`)                            | Next-generation frontend build tool providing lightning-fast HMR during development and optimized Rollup production bundling.              |
| **Tailwind CSS** (`tailwindcss`)             | Utility-first CSS framework integrated with design tokens for consistent spacing, colors, and dark mode theme switching.                   |
| **Optimistic UI**                            | UI pattern where the client interface immediately updates assuming an asynchronous API mutation will succeed, rolling back if it fails.    |
| **Error Boundary**                           | React component boundary catching JavaScript runtime errors anywhere in child component trees to render fallback error UIs.                |

---

## 5. Cross-References

- [Master Platform Glossary](../glossary.md)
- [Frontend Architecture Vision](./architecture.md)
- [Frontend Engineering Principles](./principles.md)
- [Frontend Folder Structure & Architectural Boundaries](./folder-structure.md)
- [Frontend Routing Architecture & Navigation Strategy](./routing.md)
