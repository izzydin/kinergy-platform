import { PrismaClient, Prisma } from '@prisma/client';
import { AiConversationAuditLog } from '../../../../domain/models/ai-conversation-audit-log.entity';
import { ConversationId } from '../../../../domain/value-objects/conversation-id.vo';
import { AuditHistoryCursor } from '../../../../domain/value-objects/audit-history-cursor.vo';
import {
  IAiConversationAuditRepositoryPort,
  AuditPaginationRequest,
  AuditPaginationResult,
} from '../../../../ports/outbound/ai-conversation-audit-repository.port';
import { PrismaAiConversationAuditMapper } from '../mappers/prisma-ai-conversation-audit.mapper';
import { PrismaPersistenceErrorHandler } from '../prisma-persistence-error.handler';

export class PrismaAiConversationAuditRepository implements IAiConversationAuditRepositoryPort {
  constructor(private readonly prisma: PrismaClient | Prisma.TransactionClient) {}

  /**
   * Returns a new repository instance operating within the provided transaction client.
   */
  public withTransaction(tx: Prisma.TransactionClient): PrismaAiConversationAuditRepository {
    return new PrismaAiConversationAuditRepository(tx);
  }

  public async save(auditLog: AiConversationAuditLog): Promise<AiConversationAuditLog> {
    const rawData = PrismaAiConversationAuditMapper.toPrismaCreate(auditLog);

    try {
      const raw = await this.prisma.aiConversationAuditLog.create({
        data: rawData,
      });

      return PrismaAiConversationAuditMapper.toDomain(raw);
    } catch (err) {
      PrismaPersistenceErrorHandler.handle(
        err,
        'AiConversationAuditLog',
        auditLog.id,
        auditLog.tenantId,
      );
    }
  }

  public async listByConversation(
    tenantId: string,
    conversationId: ConversationId | string,
    limit?: number,
  ): Promise<AiConversationAuditLog[]> {
    const convIdStr =
      conversationId instanceof ConversationId ? conversationId.value : conversationId;

    try {
      const records = await this.prisma.aiConversationAuditLog.findMany({
        where: {
          tenantId,
          conversationId: convIdStr,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: limit,
      });

      return records.map((r) => PrismaAiConversationAuditMapper.toDomain(r));
    } catch (err) {
      PrismaPersistenceErrorHandler.handle(err, 'AiConversationAuditLog', convIdStr, tenantId);
    }
  }

  public async listByInspector(
    tenantId: string,
    inspectorUserId: string,
    limit?: number,
  ): Promise<AiConversationAuditLog[]> {
    try {
      const records = await this.prisma.aiConversationAuditLog.findMany({
        where: {
          tenantId,
          inspectorUserId,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: limit,
      });

      return records.map((r) => PrismaAiConversationAuditMapper.toDomain(r));
    } catch (err) {
      PrismaPersistenceErrorHandler.handle(
        err,
        'AiConversationAuditLog',
        inspectorUserId,
        tenantId,
      );
    }
  }

  public async listPaginated(
    tenantId: string,
    request?: AuditPaginationRequest,
  ): Promise<AuditPaginationResult> {
    const limit = Math.min(Math.max(request?.limit ?? 20, 1), 100);

    const convIdStr = request?.conversationId
      ? request.conversationId instanceof ConversationId
        ? request.conversationId.value
        : request.conversationId
      : undefined;

    const cursor =
      request?.cursor instanceof AuditHistoryCursor
        ? request.cursor
        : typeof request?.cursor === 'string' && request.cursor.trim().length > 0
          ? AuditHistoryCursor.decode(request.cursor)
          : null;

    try {
      const records = await this.prisma.aiConversationAuditLog.findMany({
        where: {
          tenantId,
          ...(request?.inspectorUserId ? { inspectorUserId: request.inspectorUserId } : {}),
          ...(convIdStr ? { conversationId: convIdStr } : {}),
          ...(cursor
            ? {
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  {
                    createdAt: cursor.createdAt,
                    id: { lt: cursor.auditId },
                  },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      });

      const hasMore = records.length > limit;
      const resultRecords = hasMore ? records.slice(0, limit) : records;
      const items = resultRecords.map((r) => PrismaAiConversationAuditMapper.toDomain(r));

      let nextCursor: AuditHistoryCursor | null = null;
      if (hasMore && resultRecords.length > 0) {
        const last = resultRecords[resultRecords.length - 1];
        if (last) {
          nextCursor = AuditHistoryCursor.create(last.createdAt, last.id);
        }
      }

      return {
        items,
        nextCursor,
        hasMore,
      };
    } catch (err) {
      PrismaPersistenceErrorHandler.handle(
        err,
        'AiConversationAuditLog',
        'audit_paginated',
        tenantId,
      );
    }
  }
}
