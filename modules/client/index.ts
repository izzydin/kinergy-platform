/**
 * @public
 * Public API surface for the `@kinergy/client` bounded context.
 *
 * **What is exported (allowed):**
 * - {@link ClientFacade} — the concrete facade (for NestJS provider registration)
 * - {@link IClientFacade} / {@link CLIENT_FACADE_TOKEN} — the stable interface + DI token
 * - {@link ClientSummaryDto} / {@link ClientProfileDto} — public data transfer objects
 * - Integration event contracts — immutable, versioned event payloads for async consumers
 * - {@link ClientModule} — NestJS module for DI wiring
 *
 * **What is NOT exported (forbidden for external consumers):**
 * - Internal aggregates (`Client`, `ClientProps`, …)
 * - Prisma repositories (`PrismaClientRepository`, …)
 * - Domain errors (`ClientAlreadyExistsException`, …)
 * - Command handlers, query objects, or HTTP controllers
 */

// Public facade
export { ClientFacade } from './public/client.facade';
export { IClientFacade, CLIENT_FACADE_TOKEN } from './public/interfaces/client-facade.interface';

// Public DTOs
export { ClientSummaryDto } from './public/dto/client-summary.dto';
export { ClientProfileDto } from './public/dto/client-profile.dto';

// Integration event contracts
export { ClientCreatedIntegrationEvent } from './public/events/client-created.integration-event';
export { ClientArchivedIntegrationEvent } from './public/events/client-archived.integration-event';
export { ClientRestoredIntegrationEvent } from './public/events/client-restored.integration-event';
export { IdentityLinkedIntegrationEvent } from './public/events/identity-linked.integration-event';

// NestJS module (required for DI wiring in consuming apps)
export { ClientModule } from './client.module';
