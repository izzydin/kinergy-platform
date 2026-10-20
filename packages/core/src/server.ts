/**
 * Server-only infrastructure entry point for @kinergy-platform/core/server.
 * Contains relational persistence adapters, Prisma repositories, mappers, and backend-only services.
 *
 * CRITICAL ARCHITECTURAL BOUNDARY:
 * This entry point must NEVER be imported by browser-facing bundles (apps/web).
 * It is dedicated exclusively to server runtimes (apps/api) and backend integration tests.
 */

// Scheduling Persistence & Infrastructure
export * from './scheduling/infrastructure';

// Kinesiology Adapters & Infrastructure
export * from './kinesiology/infrastructure';

// Gym Persistence & Infrastructure
export * from './gym/infrastructure';

// Resources Persistence & Infrastructure
export * from './resources/infrastructure';

// Sales Persistence & Infrastructure
export * from './sales/infrastructure';
