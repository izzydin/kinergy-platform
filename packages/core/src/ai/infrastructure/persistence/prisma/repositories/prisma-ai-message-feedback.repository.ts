import { PrismaClient, Prisma } from '@prisma/client';
import { AiMessageFeedback } from '../../../../domain/models/ai-message-feedback.entity';
import { IAiMessageFeedbackRepositoryPort } from '../../../../ports/outbound/ai-message-feedback-repository.port';
import { PrismaAiMessageFeedbackMapper } from '../mappers/prisma-ai-message-feedback.mapper';
import { PrismaPersistenceErrorHandler } from '../prisma-persistence-error.handler';

export class PrismaAiMessageFeedbackRepository implements IAiMessageFeedbackRepositoryPort {
  constructor(private readonly prisma: PrismaClient | Prisma.TransactionClient) {}

  public withTransaction(tx: Prisma.TransactionClient): PrismaAiMessageFeedbackRepository {
    return new PrismaAiMessageFeedbackRepository(tx);
  }

  public async save(feedback: AiMessageFeedback): Promise<AiMessageFeedback> {
    if (!this.prisma?.aiMessageFeedback) {
      return feedback;
    }

    const rawData = PrismaAiMessageFeedbackMapper.toPrismaUncheckedCreate(feedback);

    try {
      const raw = await this.prisma.aiMessageFeedback.upsert({
        where: {
          uq_message_user_feedback: {
            messageId: feedback.messageId.value,
            userId: feedback.userId,
          },
        },
        create: rawData,
        update: {
          rating: rawData.rating,
          explanation: rawData.explanation,
          category: rawData.category,
          updatedAt: new Date(),
        },
      });

      return PrismaAiMessageFeedbackMapper.toDomain(raw);
    } catch (err) {
      PrismaPersistenceErrorHandler.handle(
        err,
        'AiMessageFeedback',
        feedback.id.value,
        feedback.tenantId,
      );
    }
  }

  public async findByMessageAndUser(
    tenantId: string,
    conversationId: string,
    messageId: string,
    userId: string,
  ): Promise<AiMessageFeedback | null> {
    if (!this.prisma?.aiMessageFeedback) {
      return null;
    }

    try {
      const raw = await this.prisma.aiMessageFeedback.findFirst({
        where: {
          tenantId,
          conversationId,
          messageId,
          userId,
        },
      });

      return raw ? PrismaAiMessageFeedbackMapper.toDomain(raw) : null;
    } catch (err) {
      PrismaPersistenceErrorHandler.handle(
        err,
        'AiMessageFeedback',
        `${messageId}:${userId}`,
        tenantId,
      );
    }
  }

  public async findById(tenantId: string, feedbackId: string): Promise<AiMessageFeedback | null> {
    if (!this.prisma?.aiMessageFeedback) {
      return null;
    }

    try {
      const raw = await this.prisma.aiMessageFeedback.findFirst({
        where: {
          id: feedbackId,
          tenantId,
        },
      });

      return raw ? PrismaAiMessageFeedbackMapper.toDomain(raw) : null;
    } catch (err) {
      PrismaPersistenceErrorHandler.handle(err, 'AiMessageFeedback', feedbackId, tenantId);
    }
  }

  public async deleteByMessageAndUser(
    tenantId: string,
    conversationId: string,
    messageId: string,
    userId: string,
  ): Promise<boolean> {
    if (!this.prisma?.aiMessageFeedback) {
      return false;
    }

    try {
      const result = await this.prisma.aiMessageFeedback.deleteMany({
        where: {
          tenantId,
          conversationId,
          messageId,
          userId,
        },
      });

      return result.count > 0;
    } catch (err) {
      PrismaPersistenceErrorHandler.handle(
        err,
        'AiMessageFeedback',
        `${messageId}:${userId}`,
        tenantId,
      );
    }
  }

  public async listByConversation(
    tenantId: string,
    conversationId: string,
  ): Promise<readonly AiMessageFeedback[]> {
    if (!this.prisma?.aiMessageFeedback) {
      return [];
    }

    try {
      const rows = await this.prisma.aiMessageFeedback.findMany({
        where: {
          tenantId,
          conversationId,
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      return rows.map((r) => PrismaAiMessageFeedbackMapper.toDomain(r));
    } catch (err) {
      PrismaPersistenceErrorHandler.handle(err, 'AiMessageFeedback', conversationId, tenantId);
    }
  }
}
