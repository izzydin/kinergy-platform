import { IAiConversationRepositoryPort } from '../../ports/outbound/ai-conversation-repository.port';
import {
  ListConversationsInput,
  ListConversationsResult,
  ConversationSummaryDto,
} from '../dtos/ai-conversation.dtos';
import { InvalidTurnInputError } from '../errors/ai-conversation-application.error';

/**
 * Use case to list conversation summaries for a user within a tenant.
 *
 * Guarantees:
 * - Deterministic keyset pagination ordered by `(lastActivityAt DESC, id DESC)`.
 * - Bounded page sizes (default 20, max 100).
 * - Optional filtering of soft-deleted/archived conversations.
 */
export class ListConversationsUseCase {
  constructor(private readonly convRepo: IAiConversationRepositoryPort) {}

  public async execute(input: ListConversationsInput): Promise<ListConversationsResult> {
    if (
      !input.tenantId ||
      typeof input.tenantId !== 'string' ||
      input.tenantId.trim().length === 0
    ) {
      throw new InvalidTurnInputError('tenantId', 'Tenant ID is required.');
    }

    if (!input.userId || typeof input.userId !== 'string' || input.userId.trim().length === 0) {
      throw new InvalidTurnInputError('userId', 'User ID is required.');
    }

    const tenantId = input.tenantId.trim();
    const userId = input.userId.trim();
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);

    if (this.convRepo.listByUserPaginated) {
      const result = await this.convRepo.listByUserPaginated(tenantId, userId, {
        cursor: input.cursor,
        limit,
        includeArchived: input.includeArchived ?? false,
      });

      const items: ConversationSummaryDto[] = result.items.map((conv) => ({
        id: conv.id.value,
        title: conv.title.value,
        turnCounter: conv.turnCounter,
        lastActivityAt: conv.lastActivityAt.toISOString(),
        createdAt: conv.createdAt.toISOString(),
        isArchived: conv.isArchived(),
      }));

      return {
        items,
        nextCursor: result.nextCursor ? result.nextCursor.encode() : null,
        hasMore: result.hasMore,
      };
    }

    // Fallback if paginated port method is not provided (e.g. lightweight mocks)
    const rawItems = await this.convRepo.listByUser(tenantId, userId, {
      limit: limit + 1,
      includeArchived: input.includeArchived ?? false,
    });

    const hasMore = rawItems.length > limit;
    const resultItems = hasMore ? rawItems.slice(0, limit) : rawItems;

    const items: ConversationSummaryDto[] = resultItems.map((conv) => ({
      id: conv.id.value,
      title: conv.title.value,
      turnCounter: conv.turnCounter,
      lastActivityAt: conv.lastActivityAt.toISOString(),
      createdAt: conv.createdAt.toISOString(),
      isArchived: conv.isArchived(),
    }));

    return {
      items,
      nextCursor: null,
      hasMore,
    };
  }
}
