import { PrismaClient, Prisma } from '@prisma/client';
import { AiConversation } from '../../../../domain/models/ai-conversation.entity';
import { ConversationId } from '../../../../domain/value-objects/conversation-id.vo';
import { ConversationListCursor } from '../../../../domain/value-objects/conversation-list-cursor.vo';
import {
  IAiConversationRepositoryPort,
  ListAiConversationsOptions,
  ConversationPaginationRequest,
  ConversationPaginationResult,
  ConversationIncludeOptions,
  ConversationWithDetails,
  UpdateConversationMetadataDto,
} from '../../../../ports/outbound/ai-conversation-repository.port';
import { PrismaAiConversationMapper } from '../mappers/prisma-ai-conversation.mapper';
import { PrismaAiConversationTurnMapper } from '../mappers/prisma-ai-conversation-turn.mapper';
import { PrismaPersistenceErrorHandler } from '../prisma-persistence-error.handler';

export class PrismaAiConversationRepository implements IAiConversationRepositoryPort {
  constructor(private readonly prisma: PrismaClient | Prisma.TransactionClient) {}

  /**
   * Returns a new repository instance operating within the provided transaction client.
   */
  public withTransaction(tx: Prisma.TransactionClient): PrismaAiConversationRepository {
    return new PrismaAiConversationRepository(tx);
  }

  public async findById(
    tenantId: string,
    id: ConversationId | string,
  ): Promise<AiConversation | null> {
    const idStr = id instanceof ConversationId ? id.value : id;
    try {
      const raw = await this.prisma.aiConversation.findFirst({
        where: {
          id: idStr,
          tenantId,
        },
      });

      if (!raw) {
        return null;
      }

      return PrismaAiConversationMapper.toDomain(raw);
    } catch (err) {
      PrismaPersistenceErrorHandler.handle(err, 'AiConversation', idStr, tenantId);
    }
  }

  public async findByIdWithDetails(
    tenantId: string,
    id: ConversationId | string,
    include?: ConversationIncludeOptions,
  ): Promise<ConversationWithDetails | null> {
    const idStr = id instanceof ConversationId ? id.value : id;
    try {
      const turnsQuery = include?.includeTurns
        ? { orderBy: { turnIndex: 'asc' as const } }
        : include?.includeLatestTurnOnly
          ? { orderBy: { turnIndex: 'desc' as const }, take: 1 }
          : false;

      const raw = await this.prisma.aiConversation.findFirst({
        where: {
          id: idStr,
          tenantId,
        },
        include: {
          turns: turnsQuery,
        },
      });

      if (!raw) {
        return null;
      }

      const conversation = PrismaAiConversationMapper.toDomain(raw);
      const turns = raw.turns?.map((t) => PrismaAiConversationTurnMapper.toDomain(t));
      const activeTurn = turns?.find((t) => !t.isTerminal()) ?? null;

      return {
        conversation,
        turns,
        activeTurn,
      };
    } catch (err) {
      PrismaPersistenceErrorHandler.handle(err, 'AiConversation', idStr, tenantId);
    }
  }

  public async findByIdempotencyKey(
    tenantId: string,
    userId: string,
    idempotencyKey: string,
  ): Promise<AiConversation | null> {
    try {
      const raw = await this.prisma.aiConversation.findFirst({
        where: {
          tenantId,
          userId,
          idempotencyKey,
        },
      });

      if (!raw) {
        return null;
      }

      return PrismaAiConversationMapper.toDomain(raw);
    } catch (err) {
      PrismaPersistenceErrorHandler.handle(err, 'AiConversation', idempotencyKey, tenantId);
    }
  }

  public async save(conversation: AiConversation): Promise<AiConversation> {
    const rawData = PrismaAiConversationMapper.toPrismaCreate(conversation);

    try {
      const raw = await this.prisma.aiConversation.upsert({
        where: {
          uq_conversation_id_tenant: {
            id: rawData.id,
            tenantId: rawData.tenantId,
          },
        },
        create: rawData,
        update: {
          title: rawData.title,
          turnCounter: rawData.turnCounter,
          messageCounter: rawData.messageCounter,
          lastActivityAt: rawData.lastActivityAt,
          updatedAt: rawData.updatedAt,
          deletedAt: rawData.deletedAt,
        },
      });

      return PrismaAiConversationMapper.toDomain(raw);
    } catch (err) {
      PrismaPersistenceErrorHandler.handle(
        err,
        'AiConversation',
        conversation.id.value,
        conversation.tenantId,
      );
    }
  }

  public async updateMetadata(
    tenantId: string,
    id: ConversationId | string,
    update: UpdateConversationMetadataDto,
  ): Promise<AiConversation> {
    const idStr = id instanceof ConversationId ? id.value : id;
    const updateData = PrismaAiConversationMapper.toPrismaUpdate(update);

    try {
      const raw = await this.prisma.aiConversation.update({
        where: {
          uq_conversation_id_tenant: {
            id: idStr,
            tenantId,
          },
        },
        data: updateData,
      });

      return PrismaAiConversationMapper.toDomain(raw);
    } catch (err) {
      PrismaPersistenceErrorHandler.handle(err, 'AiConversation', idStr, tenantId);
    }
  }

  public async listByUser(
    tenantId: string,
    userId: string,
    options?: ListAiConversationsOptions,
  ): Promise<AiConversation[]> {
    try {
      const records = await this.prisma.aiConversation.findMany({
        where: {
          tenantId,
          userId,
          ...(options?.includeArchived ? {} : { deletedAt: null }),
        },
        orderBy: {
          lastActivityAt: 'desc',
        },
        take: options?.limit,
        skip: options?.offset,
      });

      return records.map((r) => PrismaAiConversationMapper.toDomain(r));
    } catch (err) {
      PrismaPersistenceErrorHandler.handle(err, 'AiConversation', userId, tenantId);
    }
  }

  public async listByUserPaginated(
    tenantId: string,
    userId: string,
    request?: ConversationPaginationRequest,
  ): Promise<ConversationPaginationResult> {
    const limit = Math.min(Math.max(request?.limit ?? 20, 1), 100);
    const cursor =
      request?.cursor instanceof ConversationListCursor
        ? request.cursor
        : typeof request?.cursor === 'string' && request.cursor.trim().length > 0
          ? ConversationListCursor.decode(request.cursor)
          : null;

    try {
      const records = await this.prisma.aiConversation.findMany({
        where: {
          tenantId,
          userId,
          ...(request?.includeArchived ? {} : { deletedAt: null }),
          ...(cursor
            ? {
                OR: [
                  { lastActivityAt: { lt: cursor.lastActivityAt } },
                  {
                    lastActivityAt: cursor.lastActivityAt,
                    id: { lt: cursor.conversationId },
                  },
                ],
              }
            : {}),
        },
        orderBy: [{ lastActivityAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      });

      const hasMore = records.length > limit;
      const resultRecords = hasMore ? records.slice(0, limit) : records;
      const items = resultRecords.map((r) => PrismaAiConversationMapper.toDomain(r));

      let nextCursor: ConversationListCursor | null = null;
      if (hasMore && resultRecords.length > 0) {
        const last = resultRecords[resultRecords.length - 1];
        if (last) {
          nextCursor = ConversationListCursor.create(last.lastActivityAt, last.id);
        }
      }

      return {
        items,
        nextCursor,
        hasMore,
      };
    } catch (err) {
      PrismaPersistenceErrorHandler.handle(err, 'AiConversation', userId, tenantId);
    }
  }

  public async listForAudit(
    tenantId: string,
    options?: ListAiConversationsOptions,
  ): Promise<AiConversation[]> {
    try {
      const records = await this.prisma.aiConversation.findMany({
        where: {
          tenantId,
          ...(options?.includeArchived ? {} : { deletedAt: null }),
        },
        orderBy: {
          lastActivityAt: 'desc',
        },
        take: options?.limit,
        skip: options?.offset,
      });

      return records.map((r) => PrismaAiConversationMapper.toDomain(r));
    } catch (err) {
      PrismaPersistenceErrorHandler.handle(err, 'AiConversation', 'audit_list', tenantId);
    }
  }

  public async listForAuditPaginated(
    tenantId: string,
    request?: ConversationPaginationRequest,
  ): Promise<ConversationPaginationResult> {
    const limit = Math.min(Math.max(request?.limit ?? 20, 1), 100);
    const cursor =
      request?.cursor instanceof ConversationListCursor
        ? request.cursor
        : typeof request?.cursor === 'string' && request.cursor.trim().length > 0
          ? ConversationListCursor.decode(request.cursor)
          : null;

    try {
      const records = await this.prisma.aiConversation.findMany({
        where: {
          tenantId,
          ...(request?.includeArchived ? {} : { deletedAt: null }),
          ...(cursor
            ? {
                OR: [
                  { lastActivityAt: { lt: cursor.lastActivityAt } },
                  {
                    lastActivityAt: cursor.lastActivityAt,
                    id: { lt: cursor.conversationId },
                  },
                ],
              }
            : {}),
        },
        orderBy: [{ lastActivityAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      });

      const hasMore = records.length > limit;
      const resultRecords = hasMore ? records.slice(0, limit) : records;
      const items = resultRecords.map((r) => PrismaAiConversationMapper.toDomain(r));

      let nextCursor: ConversationListCursor | null = null;
      if (hasMore && resultRecords.length > 0) {
        const last = resultRecords[resultRecords.length - 1];
        if (last) {
          nextCursor = ConversationListCursor.create(last.lastActivityAt, last.id);
        }
      }

      return {
        items,
        nextCursor,
        hasMore,
      };
    } catch (err) {
      PrismaPersistenceErrorHandler.handle(err, 'AiConversation', 'audit_paginated', tenantId);
    }
  }

  public async softDelete(tenantId: string, id: ConversationId | string): Promise<void> {
    const idStr = id instanceof ConversationId ? id.value : id;
    try {
      await this.prisma.aiConversation.update({
        where: {
          uq_conversation_id_tenant: {
            id: idStr,
            tenantId,
          },
        },
        data: {
          deletedAt: new Date(),
          updatedAt: new Date(),
        },
      });
    } catch (err) {
      PrismaPersistenceErrorHandler.handle(err, 'AiConversation', idStr, tenantId);
    }
  }

  public async hardDelete(tenantId: string, id: ConversationId | string): Promise<void> {
    const idStr = id instanceof ConversationId ? id.value : id;
    try {
      await this.prisma.aiConversation.delete({
        where: {
          uq_conversation_id_tenant: {
            id: idStr,
            tenantId,
          },
        },
      });
    } catch (err) {
      PrismaPersistenceErrorHandler.handle(err, 'AiConversation', idStr, tenantId);
    }
  }
}
