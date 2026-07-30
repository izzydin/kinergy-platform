# Client Subsystem (`modules/client/`)

The Client subsystem manages the lifecycle, authoritative business profile, identity linking, duplicate detection, search indexing, and optimistic update concurrency for client profiles within the Kinergy Platform.

## Module Structure

- `domain/`: Pure framework-agnostic domain layer (Aggregates, Value Objects, Domain Events, Specifications, Exceptions, and Services).
- `application/`: Application use cases, commands, queries, DTOs, and exception models.
- `infrastructure/`: Prisma ORM persistence, database mappers, repository implementations, and migrations.
- `presentation/`: NestJS REST controllers, DTO validation pipes, and exception filters.
- `docs/`: Architecture decision records (ADRs) and progress reports.

For a detailed breakdown of implementation milestones 2.1 through 2.5, see [PHASE_2_PROGRESS.md](./PHASE_2_PROGRESS.md).
