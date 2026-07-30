import { Module } from '@nestjs/common';
import { ClientController } from './presentation/controllers/client.controller';
import { RegisterClientUseCase } from './application/use-cases/register-client.usecase';
import { LinkIdentityToClientUseCase } from './application/use-cases/link-identity-to-client.usecase';
import { ClientDuplicateCheckerService } from './domain/services/client-duplicate-checker.service';
import { CLIENT_REPOSITORY, CLIENT_SEARCH_REPOSITORY } from './domain/repositories';
import { ClientRepository } from './domain/repositories/client.repository';
import { ClientSearchRepository } from './domain/repositories/client-search.repository';
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
  ],
  exports: [
    CLIENT_REPOSITORY,
    CLIENT_SEARCH_REPOSITORY,
    RegisterClientUseCase,
    LinkIdentityToClientUseCase,
    ClientDuplicateCheckerService,
  ],
})
export class ClientModule {}
