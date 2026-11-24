import { PrismaClient, Prisma } from '@prisma/client';
import { AiConversationMessage } from '../../../../domain/models/ai-conversation-message.entity';
import { ConversationId } from '../../../../domain/value-objects/conversation-id.vo';
import { TurnId } from '../../../../domain/value-objects/turn-id.vo';
import { MessageId } from '../../../../domain/value-objects/message-id.vo';
import { MessageHistoryCursor } from '../../../../domain/value-objects/message-history-cursor.vo';
import {
  IAiConversationMessageRepositoryPort,
  ListCanonicalHistoryOptions,
  CanonicalHistoryResult,
  UpdateMessageStatusDto,
  AcquireMessageLeaseDto,
} from '../../../../ports/outbound/ai-conversation-message-repository.port';
import { PrismaAiConversationMessageMapper } from '../mappers/prisma-ai-conversation-message.mapper';
import { PrismaPersistenceErrorHandler } from '../prisma-persistence-error.handler';

export class PrismaAiConversationMessageRepository implements IAiConversationMessageRepositoryPort {
  constructor(private readonly prisma: PrismaClient | Prisma.TransactionClient) {}

  /**
   * Returns a new repository instance operating within the provided transaction client.
   */
  public withTransaction(tx: Prisma.TransactionClient): PrismaAiConversationMessageRepository {
    return new PrismaAiConversationMessageRepository(tx);
  }

  public async findById(
    tenantId: string,
    conversationId: ConversationId | string,
    messageId: MessageId | string,
  ): Promise<AiConversationMessage | null> {
    const convIdStr =
      conversationId instanceof ConversationId ? conversationId.value : conversationId;
    const msgIdStr = messageId instanceof MessageId ? messageId.value : messageId;

    try {
      const raw = await this.prisma.aiConversationMessage.findFirst({
        where: {
          id: msgIdStr,
          conversationId: convIdStr,
          tenantId,
        },
      });

      if (!raw) {
        return null;
      }

      return PrismaAiConversationMessageMapper.toDomain(raw);
    } catch (err) {
      PrismaPersistenceErrorHandler.handle(err, 'AiConversationMessage', msgIdStr, tenantId);
    }
  }

  public async findBySequenceNumber(
    tenantId: string,
    conversationId: ConversationId | string,
    sequenceNumber: number,
  ): Promise<AiConversationMessage | null> {
    const convIdStr =
      conversationId instanceof ConversationId ? conversationId.value : conversationId;

    try {
      const raw = await this.prisma.aiConversationMessage.findFirst({
        where: {
          conversationId: convIdStr,
          tenantId,
          sequenceNumber,
        },
      });

      if (!raw) {
        return null;
      }

      return PrismaAiConversationMessageMapper.toDomain(raw);
    } catch (err) {
      PrismaPersistenceErrorHandler.handle(
        err,
        'AiConversationMessage',
        `seq_${sequenceNumber}`,
        tenantId,
      );
    }
  }

  public async findCanonicalAssistantMessage(
    tenantId: string,
    conversationId: ConversationId | string,
    turnId: TurnId | string,
  ): Promise<AiConversationMessage | null> {
    const convIdStr =
      conversationId instanceof ConversationId ? conversationId.value : conversationId;
    const turnIdStr = turnId instanceof TurnId ? turnId.value : turnId;

    try {
      const raw = await this.prisma.aiConversationMessage.findFirst({
        where: {
          tenantId,
          conversationId: convIdStr,
          turnId: turnIdStr,
          role: 'ASSISTANT',
          isCanonical: true,
        },
      });

      if (!raw) {
        return null;
      }

      return PrismaAiConversationMessageMapper.toDomain(raw);
    } catch (err) {
      PrismaPersistenceErrorHandler.handle(err, 'AiConversationMessage', turnIdStr, tenantId);
    }
  }

  public async save(message: AiConversationMessage): Promise<AiConversationMessage> {
    const rawData = PrismaAiConversationMessageMapper.toPrismaCreate(message);

    try {
      const raw = await this.prisma.aiConversationMessage.upsert({
        where: {
          uq_msg_id_turn_conv_tenant: {
            id: message.id.value,
            turnId: message.turnId.value,
            conversationId: message.conversationId.value,
            tenantId: message.tenantId,
          },
        },
        create: rawData,
        update: {
          isCanonical: rawData.isCanonical,
          status: rawData.status,
          content: rawData.content,
          sources: rawData.sources ?? undefined,
          metadata: rawData.metadata ?? undefined,
          errorCode: rawData.errorCode,
          errorMessage: rawData.errorMessage,
          leaseToken: rawData.leaseToken,
          leaseOwnerInstanceId: rawData.leaseOwnerInstanceId,
          leaseExpiresAt: rawData.leaseExpiresAt,
          completedAt: rawData.completedAt,
          updatedAt: rawData.updatedAt,
        },
      });

      return PrismaAiConversationMessageMapper.toDomain(raw);
    } catch (err) {
      PrismaPersistenceErrorHandler.handle(
        err,
        'AiConversationMessage',
        message.id.value,
        message.tenantId,
      );
    }
  }

  public async updateStatus(
    tenantId: string,
    conversationId: ConversationId | string,
    messageId: MessageId | string,
    update: UpdateMessageStatusDto,
  ): Promise<AiConversationMessage> {
    const convIdStr =
      conversationId instanceof ConversationId ? conversationId.value : conversationId;
    const msgIdStr = messageId instanceof MessageId ? messageId.value : messageId;
    const updateData = PrismaAiConversationMessageMapper.toPrismaUpdate(update);

    try {
      const raw = await this.prisma.aiConversationMessage.update({
        where: {
          id: msgIdStr,
          conversationId: convIdStr,
          tenantId,
        },
        data: updateData,
      });

      return PrismaAiConversationMessageMapper.toDomain(raw);
    } catch (err) {
      PrismaPersistenceErrorHandler.handle(err, 'AiConversationMessage', msgIdStr, tenantId);
    }
  }

  public async acquireLease(
    tenantId: string,
    conversationId: ConversationId | string,
    messageId: MessageId | string,
    lease: AcquireMessageLeaseDto,
  ): Promise<AiConversationMessage> {
    const convIdStr =
      conversationId instanceof ConversationId ? conversationId.value : conversationId;
    const msgIdStr = messageId instanceof MessageId ? messageId.value : messageId;

    try {
      const raw = await this.prisma.aiConversationMessage.update({
        where: {
          id: msgIdStr,
          conversationId: convIdStr,
          tenantId,
        },
        data: {
          leaseToken: lease.leaseToken,
          leaseOwnerInstanceId: lease.leaseOwnerInstanceId,
          leaseExpiresAt: lease.leaseExpiresAt,
          updatedAt: new Date(),
        },
      });

      return PrismaAiConversationMessageMapper.toDomain(raw);
    } catch (err) {
      PrismaPersistenceErrorHandler.handle(err, 'AiConversationMessage', msgIdStr, tenantId);
    }
  }

  public async listByTurn(
    tenantId: string,
    conversationId: ConversationId | string,
    turnId: TurnId | string,
  ): Promise<AiConversationMessage[]> {
    const convIdStr =
      conversationId instanceof ConversationId ? conversationId.value : conversationId;
    const turnIdStr = turnId instanceof TurnId ? turnId.value : turnId;

    try {
      const records = await this.prisma.aiConversationMessage.findMany({
        where: {
          tenantId,
          conversationId: convIdStr,
          turnId: turnIdStr,
        },
        orderBy: [{ attemptNumber: 'asc' }, { sequenceNumber: 'asc' }],
      });

      return records.map((r) => PrismaAiConversationMessageMapper.toDomain(r));
    } catch (err) {
      PrismaPersistenceErrorHandler.handle(err, 'AiConversationMessage', turnIdStr, tenantId);
    }
  }

  public async listCanonicalHistory(
    tenantId: string,
    conversationId: ConversationId | string,
    options?: ListCanonicalHistoryOptions,
  ): Promise<CanonicalHistoryResult> {
    const convIdStr =
      conversationId instanceof ConversationId ? conversationId.value : conversationId;
    const limit = Math.min(Math.max(options?.limit ?? 20, 1), 100);

    const cursor =
      options?.cursor instanceof MessageHistoryCursor
        ? options.cursor
        : typeof options?.cursor === 'string' && options.cursor.trim().length > 0
          ? MessageHistoryCursor.decode(options.cursor)
          : null;

    try {
      const records = await this.prisma.aiConversationMessage.findMany({
        where: {
          tenantId,
          conversationId: convIdStr,
          AND: [
            {
              OR: [{ role: 'USER' }, { isCanonical: true }],
            },
            ...(cursor
              ? [
                  {
                    OR: [
                      { sequenceNumber: { gt: cursor.sequenceNumber } },
                      {
                        sequenceNumber: cursor.sequenceNumber,
                        id: { gt: cursor.messageId },
                      },
                    ],
                  },
                ]
              : []),
          ],
        },
        orderBy: [{ sequenceNumber: 'asc' }, { id: 'asc' }],
        take: limit + 1,
      });

      const hasMore = records.length > limit;
      const resultRecords = hasMore ? records.slice(0, limit) : records;
      const messages = resultRecords.map((r) => PrismaAiConversationMessageMapper.toDomain(r));

      let nextCursor: MessageHistoryCursor | null = null;
      if (hasMore && resultRecords.length > 0) {
        const last = resultRecords[resultRecords.length - 1];
        if (last) {
          nextCursor = MessageHistoryCursor.create(last.sequenceNumber, last.id);
        }
      }

      return {
        messages,
        nextCursor,
        hasMore,
      };
    } catch (err) {
      PrismaPersistenceErrorHandler.handle(err, 'AiConversationMessage', convIdStr, tenantId);
    }
  }
}
