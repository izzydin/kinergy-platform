# Client Subsystem — Architecture & Integration Diagrams

## Overview

The Client bounded context (`modules/client/`) is built following strict **Hexagonal Architecture (Ports and Adapters)** and **Domain-Driven Design (DDD)** principles.

All cross-module synchronous access is mediated through a single public entry point (`ClientFacade`), and all asynchronous cross-module notifications are handled via versioned **Integration Events**.

---

## 1. Module Architecture & Boundary Layering

The diagram below illustrates the internal Hexagonal Architecture layering (Presentation ➔ Application ➔ Domain  Infrastructure) alongside the public exported boundary (`@kinergy/client`).

```mermaid
graph TD
    subgraph ExternalConsumers ["External Bounded Contexts"]
        Appointments["Appointments Module"]
        Memberships["Memberships Module"]
        POS["POS Module"]
        Billing["Billing Module"]
        Nutrition["Nutrition Module"]
        Rentals["Rentals Module"]
    end

    subgraph PublicBoundary ["Public Exported Boundary (@kinergy/client)"]
        CLIENT_FACADE_TOKEN["CLIENT_FACADE_TOKEN"]
        IClientFacade["IClientFacade (Interface)"]
        ClientFacade["ClientFacade (Implementation)"]
        ClientSummaryDto["ClientSummaryDto"]
        ClientProfileDto["ClientProfileDto (Public Path)"]
        IntegrationEvents["Integration Events (ClientCreated, ClientArchived, etc.)"]
    end

    subgraph PresentationLayer ["Presentation Layer"]
        ClientController["ClientController (REST API)"]
        ClientExceptionFilter["ClientExceptionFilter"]
    end

    subgraph ApplicationLayer ["Application Layer"]
        UseCases["Use Cases (Register, Update, Archive, GetProfile, Search)"]
        Queries["Query Objects"]
        Commands["Command Objects"]
        ProjectionHandler["ClientTimelineProjectionHandler"]
    end

    subgraph DomainLayer ["Domain Layer (Framework-Agnostic Core)"]
        ClientAggregate["Client Aggregate Root"]
        ValueObjects["Value Objects (ClientId, Email, Phone, etc.)"]
        DomainEvents["Domain Events (ClientCreatedEvent, etc.)"]
        Specifications["Domain Specifications"]
        RepoInterfaces["Repository Interfaces (ClientRepository, TimelineRepository)"]
    end

    subgraph InfrastructureLayer ["Infrastructure Layer"]
        PrismaClientRepo["PrismaClientRepository"]
        PrismaTimelineRepo["PrismaClientTimelineRepository"]
        ClientMapper["ClientMapper"]
    end

    subgraph DatabaseBoundary ["Isolated Database Boundary"]
        ClientsTable[("clients Table")]
        TimelineTable[("client_timeline_entries Table")]
    end

    %% External Connections
    Appointments -->|1. Inject via Token| CLIENT_FACADE_TOKEN
    Memberships -->|1. Inject via Token| CLIENT_FACADE_TOKEN
    POS -->|1. Query Summary| IClientFacade
    CLIENT_FACADE_TOKEN --> IClientFacade
    IClientFacade --> ClientFacade

    %% Public Facade Internal Delegation
    ClientFacade -->|2. Delegates to Query Use Cases| UseCases
    ClientFacade -->|3. Maps to Public DTOs| ClientSummaryDto
    ClientFacade -->|3. Maps to Public DTOs| ClientProfileDto

    %% Layer Dependencies (Hexagonal Invariants)
    ClientController --> UseCases
    ClientController --> ClientExceptionFilter
    UseCases --> RepoInterfaces
    UseCases --> DomainEvents
    RepoInterfaces <---|Implements| PrismaClientRepo
    RepoInterfaces <---|Implements| PrismaTimelineRepo
    PrismaClientRepo --> ClientMapper
    ClientMapper --> ClientAggregate

    %% Database Isolation
    PrismaClientRepo -->|Isolated SQL Access| ClientsTable
    PrismaTimelineRepo -->|Isolated SQL Access| TimelineTable

    %% Styling
    style PublicBoundary fill:#1f2937,stroke:#3b82f6,stroke-width:2px,color:#fff
    style DatabaseBoundary fill:#374151,stroke:#ef4444,stroke-width:2px,color:#fff
    style DomainLayer fill:#1e1b4b,stroke:#8b5cf6,stroke-width:2px,color:#fff
```

---

## 2. Synchronous Integration Sequence Diagram

This diagram illustrates an external module (`AppointmentsModule`) executing a synchronous check to verify if a client is active prior to booking an appointment. Notice how `ClientFacade` intercepts internal domain exceptions (e.g. `ClientNotFoundException`) and returns `false` or `null` without leaking private exception types across module boundaries.

```mermaid
sequenceDiagram
    autonumber
    actor User as Client / Staff User
    participant AppService as AppointmentsService (External Module)
    participant Facade as ClientFacade (IClientFacade)
    participant UseCase as GetClientProfileUseCase
    participant Repo as PrismaClientRepository
    participant DB as PostgreSQL Database

    User->>AppService: Book Appointment Request (clientId)
    AppService->>Facade: isClientActive(clientId)

    rect rgb(30, 41, 59)
        note right of Facade: Internal Module Delegation & Exception Shielding
        Facade->>UseCase: execute(GetClientProfileQuery)
        UseCase->>Repo: findById(ClientId.create(clientId))
        Repo->>DB: SELECT * FROM clients WHERE id = $1

        alt Client Found & Active
            DB-->>Repo: Client Record (status = "ACTIVE")
            Repo-->>UseCase: Client Aggregate Root
            UseCase-->>Facade: ClientProfileDto (status = "ACTIVE")
            Facade-->>AppService: true
            AppService-->>User: Proceed with Booking
        else Client Found but Archived
            DB-->>Repo: Client Record (status = "ARCHIVED")
            Repo-->>UseCase: Client Aggregate Root
            UseCase-->>Facade: ClientProfileDto (status = "ARCHIVED")
            Facade-->>AppService: false
            AppService-->>User: Reject Booking (Client Archived)
        else Client Not Found in Database
            DB-->>Repo: null
            Repo-->>UseCase: null
            UseCase-->>Facade: throws ClientNotFoundException
            note over Facade: Catch ClientNotFoundException<br/>Translate to null / false fallback
            Facade-->>AppService: false
            AppService-->>User: Reject Booking (Client Does Not Exist)
        end
    end
```

---

## 3. Asynchronous Integration Sequence Diagram

This diagram illustrates how an external bounded context (e.g., `Appointments`) publishes an integration event (`AppointmentScheduledIntegrationEvent`) when an appointment is booked, and how the Client subsystem asynchronously consumes it to update the Client Activity Feed read model (`client_timeline_entries`).

```mermaid
sequenceDiagram
    autonumber
    participant AppDomain as Appointments Context
    participant EventBus as Event Bus / Message Broker
    participant TimelineHandler as ClientTimelineProjectionHandler
    participant TimelineRepo as PrismaClientTimelineRepository
    participant DB as PostgreSQL (client_timeline_entries)

    Note over AppDomain, EventBus: Asynchronous Cross-Module Activity Feed Projection

    AppDomain->>EventBus: Publish AppointmentScheduledIntegrationEvent
    note right of AppDomain: payload: { appointmentId, clientId, serviceName, providerName, scheduledFor }

    EventBus->>TimelineHandler: Deliver Integration Event

    rect rgb(30, 41, 59)
        note right of TimelineHandler: Asynchronous Projection Execution
        TimelineHandler->>TimelineHandler: Build ClientTimelineEntry Read Model
        note right of TimelineHandler: eventType: "APPOINTMENT_SCHEDULED"<br/>summary: "Scheduled haircut with Alex"<br/>occurredAt: event.occurredAt

        TimelineHandler->>TimelineRepo: save(timelineEntry)
        TimelineRepo->>DB: INSERT INTO client_timeline_entries (...)

        alt Persistence Success
            DB-->>TimelineRepo: OK
            TimelineRepo-->>TimelineHandler: OK
        else Persistence Error (Non-Blocking)
            DB-->>TimelineRepo: Database Error / Constraint Failure
            TimelineRepo-->>TimelineHandler: Throws Error
            note over TimelineHandler: Catch & Log Error<br/>Prevent write-model transaction rollback
        end
    end
```
