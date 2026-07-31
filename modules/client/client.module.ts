import { Module } from '@nestjs/common';
import { ClientController } from './presentation/controllers/client.controller';
import { RegisterClientUseCase } from './application/use-cases/register-client.usecase';
import { LinkIdentityToClientUseCase } from './application/use-cases/link-identity-to-client.usecase';
import { GetClientProfileUseCase } from './application/use-cases/get-client-profile.usecase';
import { SearchClientsUseCase } from './application/use-cases/search-clients.usecase';
import { UpdateClientUseCase } from './application/use-cases/update-client.usecase';
import { ArchiveClientUseCase } from './application/use-cases/archive-client.usecase';
import { RestoreClientUseCase } from './application/use-cases/restore-client.usecase';
import { GetClientHistoryUseCase } from './application/use-cases/get-client-history.usecase';
import { ClientTimelineProjectionHandler } from './application/events/client-timeline-projection.handler';
import { DomainEventDispatcher } from './application/events/domain-event-dispatcher';
import { ClientDuplicateCheckerService } from './domain/services/client-duplicate-checker.service';
import {
  CLIENT_REPOSITORY,
  CLIENT_SEARCH_REPOSITORY,
  CLIENT_TIMELINE_REPOSITORY,
} from './domain/repositories';
import { ClientRepository } from './domain/repositories/client.repository';
import { ClientSearchRepository } from './domain/repositories/client-search.repository';
import { ClientTimelineRepository } from './domain/repositories/client-timeline.repository';
import { PrismaClientRepository } from './infrastructure/persistence/prisma/prisma-client.repository';
import { PrismaClientTimelineRepository } from './infrastructure/persistence/prisma/prisma-client-timeline.repository';
import { ClientFacade } from './public/client.facade';
import { CLIENT_FACADE_TOKEN } from './public/interfaces/client-facade.interface';

@Module({
  controllers: [ClientController],
  providers: [
    PrismaClientRepository,
    PrismaClientTimelineRepository,
    {
      provide: CLIENT_REPOSITORY,
      useClass: PrismaClientRepository,
    },
    {
      provide: CLIENT_SEARCH_REPOSITORY,
      useClass: PrismaClientRepository,
    },
    {
      provide: CLIENT_TIMELINE_REPOSITORY,
      useClass: PrismaClientTimelineRepository,
    },
    {
      provide: ClientTimelineProjectionHandler,
      useFactory: (timelineRepo: ClientTimelineRepository) =>
        new ClientTimelineProjectionHandler(timelineRepo),
      inject: [CLIENT_TIMELINE_REPOSITORY],
    },
    {
      provide: DomainEventDispatcher,
      useFactory: (handler: ClientTimelineProjectionHandler) => new DomainEventDispatcher(handler),
      inject: [ClientTimelineProjectionHandler],
    },
    {
      provide: ClientDuplicateCheckerService,
      useFactory: (repo: ClientRepository, searchRepo: ClientSearchRepository) =>
        new ClientDuplicateCheckerService(repo, searchRepo),
      inject: [CLIENT_REPOSITORY, CLIENT_SEARCH_REPOSITORY],
    },
    {
      provide: RegisterClientUseCase,
      useFactory: (
        repo: ClientRepository,
        checker: ClientDuplicateCheckerService,
        dispatcher: DomainEventDispatcher,
      ) => new RegisterClientUseCase(repo, checker, dispatcher),
      inject: [CLIENT_REPOSITORY, ClientDuplicateCheckerService, DomainEventDispatcher],
    },
    {
      provide: LinkIdentityToClientUseCase,
      useFactory: (repo: ClientRepository, dispatcher: DomainEventDispatcher) =>
        new LinkIdentityToClientUseCase(repo, dispatcher),
      inject: [CLIENT_REPOSITORY, DomainEventDispatcher],
    },
    {
      provide: GetClientProfileUseCase,
      useFactory: (repo: ClientRepository) => new GetClientProfileUseCase(repo),
      inject: [CLIENT_REPOSITORY],
    },
    {
      provide: SearchClientsUseCase,
      useFactory: (searchRepo: ClientSearchRepository) => new SearchClientsUseCase(searchRepo),
      inject: [CLIENT_SEARCH_REPOSITORY],
    },
    {
      provide: UpdateClientUseCase,
      useFactory: (
        repo: ClientRepository,
        checker: ClientDuplicateCheckerService,
        dispatcher: DomainEventDispatcher,
      ) => new UpdateClientUseCase(repo, checker, dispatcher),
      inject: [CLIENT_REPOSITORY, ClientDuplicateCheckerService, DomainEventDispatcher],
    },
    {
      provide: ArchiveClientUseCase,
      useFactory: (repo: ClientRepository, dispatcher: DomainEventDispatcher) =>
        new ArchiveClientUseCase(repo, dispatcher),
      inject: [CLIENT_REPOSITORY, DomainEventDispatcher],
    },
    {
      provide: RestoreClientUseCase,
      useFactory: (repo: ClientRepository, dispatcher: DomainEventDispatcher) =>
        new RestoreClientUseCase(repo, dispatcher),
      inject: [CLIENT_REPOSITORY, DomainEventDispatcher],
    },
    {
      provide: GetClientHistoryUseCase,
      useFactory: (repo: ClientRepository, timelineRepo: ClientTimelineRepository) =>
        new GetClientHistoryUseCase(repo, timelineRepo),
      inject: [CLIENT_REPOSITORY, CLIENT_TIMELINE_REPOSITORY],
    },
    {
      provide: ClientFacade,
      useFactory: (
        getProfileUseCase: GetClientProfileUseCase,
        searchUseCase: SearchClientsUseCase,
      ) => new ClientFacade(getProfileUseCase, searchUseCase),
      inject: [GetClientProfileUseCase, SearchClientsUseCase],
    },
    {
      provide: CLIENT_FACADE_TOKEN,
      useExisting: ClientFacade,
    },
  ],
  exports: [
    CLIENT_REPOSITORY,
    CLIENT_SEARCH_REPOSITORY,
    CLIENT_TIMELINE_REPOSITORY,
    RegisterClientUseCase,
    LinkIdentityToClientUseCase,
    GetClientProfileUseCase,
    SearchClientsUseCase,
    UpdateClientUseCase,
    ArchiveClientUseCase,
    RestoreClientUseCase,
    GetClientHistoryUseCase,
    ClientTimelineProjectionHandler,
    DomainEventDispatcher,
    ClientDuplicateCheckerService,
    // Public API — the only stable cross-module contract for the Client context
    ClientFacade,
    CLIENT_FACADE_TOKEN,
  ],
})
export class ClientModule {}
