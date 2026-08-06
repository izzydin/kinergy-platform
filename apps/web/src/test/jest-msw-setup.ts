/**
 * Jest MSW Setup Placeholder
 *
 * NOTE: MSW v2 is intentionally NOT used in Jest test specs due to ESM compatibility
 * issues between MSW v2's transitive dependencies (rettime, @mswjs/interceptors) and
 * ts-jest (CJS mode). MSW is validated via the browser Service Worker in the dev server.
 *
 * Tests that exercise network behavior use jest.spyOn(global, 'fetch') directly.
 * See: src/modules/__tests__/mock-backend-transport.spec.ts
 *
 * This file is kept as a placeholder to document the architectural decision.
 */

export {};
