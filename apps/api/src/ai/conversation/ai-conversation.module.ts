import { Module } from '@nestjs/common';
import { PrismaModule } from '../../platform/persistence/prisma/prisma.module';
import { IdentityModule } from '../../platform/identity/identity.module';
import { AiConversationController } from './ai-conversation.controller';
import { aiConversationProviders } from './providers/ai-conversation.providers';
import {
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
  GetMessageCitationsUseCase,
  GetCitationDetailUseCase,
  AI_CONVERSATION_REPOSITORY_PORT,
  AI_CONVERSATION_TURN_REPOSITORY_PORT,
  AI_CONVERSATION_MESSAGE_REPOSITORY_PORT,
  AI_CONVERSATION_AUDIT_REPOSITORY_PORT,
  AI_CONVERSATION_CITATION_REPOSITORY_PORT,
  AI_CONVERSATION_TRANSACTION_RUNNER,
} from '@kinergy-platform/core';
import { PrismaAiConversationCitationRepository } from '@kinergy-platform/core/server';

/**
 * NestJS module establishing the REST API foundation for AI conversation persistence & lifecycle.
 *
 * Guarantees:
 * - Wires all BE.04 application use cases into the NestJS dependency injection container.
 * - Provides trusted authentication and tenant context extraction.
 * - Translates application domain exceptions into standard HTTP responses.
 * - Integrates with Swagger/OpenAPI documentation.
 */
@Module({
  imports: [PrismaModule, IdentityModule],
  controllers: [AiConversationController],
  providers: [...aiConversationProviders],
  exports: [
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
    GetMessageCitationsUseCase,
    GetCitationDetailUseCase,
    AI_CONVERSATION_REPOSITORY_PORT,
    AI_CONVERSATION_TURN_REPOSITORY_PORT,
    AI_CONVERSATION_MESSAGE_REPOSITORY_PORT,
    AI_CONVERSATION_AUDIT_REPOSITORY_PORT,
    AI_CONVERSATION_CITATION_REPOSITORY_PORT,
    PrismaAiConversationCitationRepository,
    AI_CONVERSATION_TRANSACTION_RUNNER,
  ],
})
export class AiConversationModule {}
