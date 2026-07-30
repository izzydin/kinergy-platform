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

@Module({
  controllers: [ClientController],
  providers: [
    PrismaClientRepository,
    {
      provide: CLIENT_REPOSITORY,
      useClass: PrismaClientRepository,
    },
    {
      provide: CLIENT_SEARCH_REPOSITORY,
      useClass: PrismaClientRepository,
    },
    {
      provide: ClientDuplicateCheckerService,
      useFactory: (repo: ClientRepository, searchRepo: ClientSearchRepository) =>
        new ClientDuplicateCheckerService(repo, searchRepo),
      inject: [CLIENT_REPOSITORY, CLIENT_SEARCH_REPOSITORY],
    },
    {
      provide: RegisterClientUseCase,
      useFactory: (repo: ClientRepository, checker: ClientDuplicateCheckerService) =>
        new RegisterClientUseCase(repo, checker),
      inject: [CLIENT_REPOSITORY, ClientDuplicateCheckerService],
    },
    {
      provide: LinkIdentityToClientUseCase,
      useFactory: (repo: ClientRepository) => new LinkIdentityToClientUseCase(repo),
      inject: [CLIENT_REPOSITORY],
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
      useFactory: (repo: ClientRepository, checker: ClientDuplicateCheckerService) =>
        new UpdateClientUseCase(repo, checker),
      inject: [CLIENT_REPOSITORY, ClientDuplicateCheckerService],
    },
    {
      provide: ArchiveClientUseCase,
      useFactory: (repo: ClientRepository) => new ArchiveClientUseCase(repo),
      inject: [CLIENT_REPOSITORY],
    },
    {
      provide: RestoreClientUseCase,
      useFactory: (repo: ClientRepository) => new RestoreClientUseCase(repo),
      inject: [CLIENT_REPOSITORY],
    },
    {
      provide: GetClientHistoryUseCase,
      useFactory: (repo: ClientRepository, timelineRepo: ClientTimelineRepository) =>
        new GetClientHistoryUseCase(repo, timelineRepo),
      inject: [CLIENT_REPOSITORY, CLIENT_TIMELINE_REPOSITORY],
    },
    {
      provide: ClientTimelineProjectionHandler,
      useFactory: (timelineRepo: ClientTimelineRepository) =>
        new ClientTimelineProjectionHandler(timelineRepo),
      inject: [CLIENT_TIMELINE_REPOSITORY],
    },
  ],
  exports: [
    CLIENT_REPOSITORY,
    CLIENT_SEARCH_REPOSITORY,
    RegisterClientUseCase,
    LinkIdentityToClientUseCase,
    GetClientProfileUseCase,
    SearchClientsUseCase,
    UpdateClientUseCase,
    ArchiveClientUseCase,
    RestoreClientUseCase,
    GetClientHistoryUseCase,
    ClientTimelineProjectionHandler,
    ClientDuplicateCheckerService,
  ],
})
export class ClientModule {}
