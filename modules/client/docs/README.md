# Client Subsystem (`modules/client/`)

The Client subsystem manages the lifecycle, authoritative business profile, identity linking, duplicate detection, search indexing, and optimistic update concurrency for client profiles within the Kinergy Platform.

## Module Structure

- `domain/`: Pure framework-agnostic domain layer (Aggregates, Value Objects, Domain Events, Specifications, Exceptions, and Services).
- `application/`: Application use cases, commands, queries, DTOs, and exception models.
- `infrastructure/`: Prisma ORM persistence, database mappers, repository implementations, and migrations.
- `presentation/`: NestJS REST controllers, DTO validation pipes, and exception filters.

## Documentation Index

- **[INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md)**: Comprehensive developer guide for importing `ClientModule`, injecting `IClientFacade`, and integrating with client capabilities.
- **[EVENT_CATALOG.md](./EVENT_CATALOG.md)**: Catalog of published integration events (`ClientCreatedIntegrationEvent`, etc.) and consumed external activity feed events.
- **[ARCHITECTURE.md](./ARCHITECTURE.md)**: Hexagonal Architecture layering diagrams and synchronous/asynchronous integration sequence diagrams (Mermaid.js).
- **[ADR 0001: Client Integration Facade & Event Contracts](./adr/0001-client-integration-facade-and-event-contracts.md)**: Architecture Decision Record for facade integration, event contracts, zero database coupling, and versioning policies.
- **[PHASE_2_PROGRESS.md](./PHASE_2_PROGRESS.md)**: Comprehensive milestone breakdown (Milestones 2.1 to 2.8).
