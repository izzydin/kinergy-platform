import { IAiConversationRepositoryPort } from '../../ports/outbound/ai-conversation-repository.port';
import { IAiConversationTurnRepositoryPort } from '../../ports/outbound/ai-conversation-turn-repository.port';
import {
  GetConversationInput,
  ConversationDetailDto,
  TurnSummaryDto,
} from '../dtos/ai-conversation.dtos';
import {
  InvalidTurnInputError,
  ConversationNotFoundError,
} from '../errors/ai-conversation-application.error';

/**
 * Use case to retrieve a single conversation within a tenant boundary.
 *
 * Guarantees:
 * - Strict tenant isolation (rejects cross-tenant data leaks).
 * - Optional retrieval of child turn summaries.
 * - Explicit active turn identification if generation is in progress.
 */
export class GetConversationUseCase {
  constructor(
    private readonly convRepo: IAiConversationRepositoryPort,
    private readonly turnRepo: IAiConversationTurnRepositoryPort,
  ) {}

  public async execute(input: GetConversationInput): Promise<ConversationDetailDto> {
    if (
      !input.tenantId ||
      typeof input.tenantId !== 'string' ||
      input.tenantId.trim().length === 0
    ) {
      throw new InvalidTurnInputError('tenantId', 'Tenant ID is required.');
    }

    if (
      !input.conversationId ||
      typeof input.conversationId !== 'string' ||
      input.conversationId.trim().length === 0
    ) {
      throw new InvalidTurnInputError('conversationId', 'Conversation ID is required.');
    }

    const tenantId = input.tenantId.trim();
    const conversationId = input.conversationId.trim();

    // 1. Fetch details or base conversation
    if (input.includeTurns && this.convRepo.findByIdWithDetails) {
      const details = await this.convRepo.findByIdWithDetails(tenantId, conversationId, {
        includeTurns: true,
      });

      if (!details) {
        throw new ConversationNotFoundError(conversationId, tenantId);
      }

      const turnsDto: TurnSummaryDto[] = (details.turns ?? []).map((t) => ({
        id: t.id.value,
        turnIndex: t.turnIndex,
        status: t.status,
        clientTurnId: t.clientTurnId.value,
        activeAttemptId: t.activeAttemptId ? t.activeAttemptId.value : null,
        activeAttemptNumber: t.activeAttemptNumber,
        createdAt: t.createdAt.toISOString(),
        completedAt: t.completedAt ? t.completedAt.toISOString() : null,
      }));

      return {
        id: details.conversation.id.value,
        tenantId: details.conversation.tenantId,
        userId: details.conversation.userId,
        title: details.conversation.title.value,
        turnCounter: details.conversation.turnCounter,
        messageCounter: details.conversation.messageCounter,
        lastActivityAt: details.conversation.lastActivityAt.toISOString(),
        createdAt: details.conversation.createdAt.toISOString(),
        updatedAt: details.conversation.updatedAt.toISOString(),
        isArchived: details.conversation.isArchived(),
        turns: turnsDto,
        activeTurnId: details.activeTurn ? details.activeTurn.id.value : null,
      };
    }

    const conv = await this.convRepo.findById(tenantId, conversationId);
    if (!conv) {
      throw new ConversationNotFoundError(conversationId, tenantId);
    }

    let turnsDto: TurnSummaryDto[] | undefined;
    let activeTurnId: string | null = null;

    if (input.includeTurns) {
      const turns = await this.turnRepo.listByConversation(tenantId, conversationId);
      turnsDto = turns.map((t) => ({
        id: t.id.value,
        turnIndex: t.turnIndex,
        status: t.status,
        clientTurnId: t.clientTurnId.value,
        activeAttemptId: t.activeAttemptId ? t.activeAttemptId.value : null,
        activeAttemptNumber: t.activeAttemptNumber,
        createdAt: t.createdAt.toISOString(),
        completedAt: t.completedAt ? t.completedAt.toISOString() : null,
      }));

      const activeTurn = turns.find((t) => !t.isTerminal());
      activeTurnId = activeTurn ? activeTurn.id.value : null;
    } else if (this.turnRepo.findActiveTurn) {
      const activeTurn = await this.turnRepo.findActiveTurn(tenantId, conversationId);
      activeTurnId = activeTurn ? activeTurn.id.value : null;
    }

    return {
      id: conv.id.value,
      tenantId: conv.tenantId,
      userId: conv.userId,
      title: conv.title.value,
      turnCounter: conv.turnCounter,
      messageCounter: conv.messageCounter,
      lastActivityAt: conv.lastActivityAt.toISOString(),
      createdAt: conv.createdAt.toISOString(),
      updatedAt: conv.updatedAt.toISOString(),
      isArchived: conv.isArchived(),
      turns: turnsDto,
      activeTurnId,
    };
  }
}
