import { Provider } from '@nestjs/common';
import { PrismaService } from '../../../platform/persistence/prisma/prisma.service';
import {
  AI_CONVERSATION_REPOSITORY_PORT,
  AI_CONVERSATION_TURN_REPOSITORY_PORT,
  AI_CONVERSATION_MESSAGE_REPOSITORY_PORT,
  AI_CONVERSATION_AUDIT_REPOSITORY_PORT,
  AI_CONVERSATION_TRANSACTION_RUNNER,
  CreateConversationWithInitialTurnUseCase,
  ReserveConversationTurnUseCase,
  GetConversationUseCase,
  ListConversationsUseCase,
  GetMessageHistoryUseCase,
  UpdateConversationTitleUseCase,
  ArchiveConversationUseCase,
  PersistMessageStateUseCase,
  PrivilegedInspectConversationUseCase,
  LoadCanonicalConversationHistoryUseCase,
  CancelConversationTurnUseCase,
  AI_TURN_DISPATCHER_PORT,
  IAiTurnDispatcherPort,
} from '@kinergy-platform/core';
import {
  PrismaAiConversationRepository,
  PrismaAiConversationTurnRepository,
  PrismaAiConversationMessageRepository,
  PrismaAiConversationAuditRepository,
  PrismaAiConversationTransactionRunner,
} from '@kinergy-platform/core/server';

/**
 * Dependency injection providers for AI Conversation persistence and application use cases.
 *
 * Guarantees:
 * - All repositories are initialized with PrismaService.
 * - Application use cases are cleanly instantiated with their required ports.
 * - Decouples controllers from direct Prisma database access.
 */
export const aiConversationProviders: Provider[] = [
  // 1. Prisma Repositories
  {
    provide: PrismaAiConversationRepository,
    useFactory: (prisma: PrismaService) => new PrismaAiConversationRepository(prisma),
    inject: [PrismaService],
  },
  {
    provide: AI_CONVERSATION_REPOSITORY_PORT,
    useExisting: PrismaAiConversationRepository,
  },
  {
    provide: PrismaAiConversationTurnRepository,
    useFactory: (prisma: PrismaService) => new PrismaAiConversationTurnRepository(prisma),
    inject: [PrismaService],
  },
  {
    provide: AI_CONVERSATION_TURN_REPOSITORY_PORT,
    useExisting: PrismaAiConversationTurnRepository,
  },
  {
    provide: PrismaAiConversationMessageRepository,
    useFactory: (prisma: PrismaService) => new PrismaAiConversationMessageRepository(prisma),
    inject: [PrismaService],
  },
  {
    provide: AI_CONVERSATION_MESSAGE_REPOSITORY_PORT,
    useExisting: PrismaAiConversationMessageRepository,
  },
  {
    provide: PrismaAiConversationAuditRepository,
    useFactory: (prisma: PrismaService) => new PrismaAiConversationAuditRepository(prisma),
    inject: [PrismaService],
  },
  {
    provide: AI_CONVERSATION_AUDIT_REPOSITORY_PORT,
    useExisting: PrismaAiConversationAuditRepository,
  },

  // 2. Transaction Runner
  {
    provide: PrismaAiConversationTransactionRunner,
    useFactory: (
      prisma: PrismaService,
      convRepo: PrismaAiConversationRepository,
      turnRepo: PrismaAiConversationTurnRepository,
      msgRepo: PrismaAiConversationMessageRepository,
      auditRepo: PrismaAiConversationAuditRepository,
    ) => new PrismaAiConversationTransactionRunner(prisma, convRepo, turnRepo, msgRepo, auditRepo),
    inject: [
      PrismaService,
      PrismaAiConversationRepository,
      PrismaAiConversationTurnRepository,
      PrismaAiConversationMessageRepository,
      PrismaAiConversationAuditRepository,
    ],
  },
  {
    provide: AI_CONVERSATION_TRANSACTION_RUNNER,
    useExisting: PrismaAiConversationTransactionRunner,
  },

  // 3. Application Use Cases
  {
    provide: CreateConversationWithInitialTurnUseCase,
    useFactory: (
      txRunner: PrismaAiConversationTransactionRunner,
      turnRepo: PrismaAiConversationTurnRepository,
      convRepo: PrismaAiConversationRepository,
      msgRepo: PrismaAiConversationMessageRepository,
      dispatcher?: IAiTurnDispatcherPort,
    ) =>
      new CreateConversationWithInitialTurnUseCase(
        txRunner,
        turnRepo,
        convRepo,
        msgRepo,
        undefined,
        dispatcher,
      ),
    inject: [
      PrismaAiConversationTransactionRunner,
      PrismaAiConversationTurnRepository,
      PrismaAiConversationRepository,
      PrismaAiConversationMessageRepository,
      { token: AI_TURN_DISPATCHER_PORT, optional: true },
    ],
  },
  {
    provide: ReserveConversationTurnUseCase,
    useFactory: (
      txRunner: PrismaAiConversationTransactionRunner,
      turnRepo: PrismaAiConversationTurnRepository,
      convRepo: PrismaAiConversationRepository,
      msgRepo: PrismaAiConversationMessageRepository,
      dispatcher?: IAiTurnDispatcherPort,
    ) =>
      new ReserveConversationTurnUseCase(
        txRunner,
        turnRepo,
        convRepo,
        msgRepo,
        undefined,
        dispatcher,
      ),
    inject: [
      PrismaAiConversationTransactionRunner,
      PrismaAiConversationTurnRepository,
      PrismaAiConversationRepository,
      PrismaAiConversationMessageRepository,
      { token: AI_TURN_DISPATCHER_PORT, optional: true },
    ],
  },
  {
    provide: CancelConversationTurnUseCase,
    useFactory: (
      convRepo: PrismaAiConversationRepository,
      turnRepo: PrismaAiConversationTurnRepository,
      msgRepo: PrismaAiConversationMessageRepository,
      txRunner: PrismaAiConversationTransactionRunner,
      dispatcher?: IAiTurnDispatcherPort,
    ) => new CancelConversationTurnUseCase(convRepo, turnRepo, msgRepo, txRunner, dispatcher),
    inject: [
      PrismaAiConversationRepository,
      PrismaAiConversationTurnRepository,
      PrismaAiConversationMessageRepository,
      PrismaAiConversationTransactionRunner,
      { token: AI_TURN_DISPATCHER_PORT, optional: true },
    ],
  },
  {
    provide: GetConversationUseCase,
    useFactory: (
      convRepo: PrismaAiConversationRepository,
      turnRepo: PrismaAiConversationTurnRepository,
    ) => new GetConversationUseCase(convRepo, turnRepo),
    inject: [PrismaAiConversationRepository, PrismaAiConversationTurnRepository],
  },
  {
    provide: ListConversationsUseCase,
    useFactory: (convRepo: PrismaAiConversationRepository) =>
      new ListConversationsUseCase(convRepo),
    inject: [PrismaAiConversationRepository],
  },
  {
    provide: GetMessageHistoryUseCase,
    useFactory: (
      convRepo: PrismaAiConversationRepository,
      msgRepo: PrismaAiConversationMessageRepository,
    ) => new GetMessageHistoryUseCase(convRepo, msgRepo),
    inject: [PrismaAiConversationRepository, PrismaAiConversationMessageRepository],
  },
  {
    provide: UpdateConversationTitleUseCase,
    useFactory: (convRepo: PrismaAiConversationRepository) =>
      new UpdateConversationTitleUseCase(convRepo),
    inject: [PrismaAiConversationRepository],
  },
  {
    provide: ArchiveConversationUseCase,
    useFactory: (
      convRepo: PrismaAiConversationRepository,
      turnRepo: PrismaAiConversationTurnRepository,
    ) => new ArchiveConversationUseCase(convRepo, turnRepo),
    inject: [PrismaAiConversationRepository, PrismaAiConversationTurnRepository],
  },
  {
    provide: PersistMessageStateUseCase,
    useFactory: (msgRepo: PrismaAiConversationMessageRepository) =>
      new PersistMessageStateUseCase(msgRepo),
    inject: [PrismaAiConversationMessageRepository],
  },
  {
    provide: PrivilegedInspectConversationUseCase,
    useFactory: (
      convRepo: PrismaAiConversationRepository,
      msgRepo: PrismaAiConversationMessageRepository,
      auditRepo: PrismaAiConversationAuditRepository,
    ) => new PrivilegedInspectConversationUseCase(convRepo, msgRepo, auditRepo),
    inject: [
      PrismaAiConversationRepository,
      PrismaAiConversationMessageRepository,
      PrismaAiConversationAuditRepository,
    ],
  },
  {
    provide: LoadCanonicalConversationHistoryUseCase,
    useFactory: (
      convRepo: PrismaAiConversationRepository,
      turnRepo: PrismaAiConversationTurnRepository,
      msgRepo: PrismaAiConversationMessageRepository,
    ) => new LoadCanonicalConversationHistoryUseCase(convRepo, turnRepo, msgRepo),
    inject: [
      PrismaAiConversationRepository,
      PrismaAiConversationTurnRepository,
      PrismaAiConversationMessageRepository,
    ],
  },
];
