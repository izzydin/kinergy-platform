import {
  AiMessageFeedback as PrismaFeedback,
  FeedbackRating as PrismaFeedbackRating,
  Prisma,
} from '@prisma/client';
import { AiMessageFeedback } from '../../../../domain/models/ai-message-feedback.entity';
import { FeedbackRating } from '../../../../domain/enums/feedback-rating.enum';

/**
 * Maps between Prisma AiMessageFeedback models and Domain AiMessageFeedback entities.
 */
export class PrismaAiMessageFeedbackMapper {
  public static toDomain(raw: PrismaFeedback): AiMessageFeedback {
    return AiMessageFeedback.reconstitute({
      id: raw.id,
      tenantId: raw.tenantId,
      conversationId: raw.conversationId,
      messageId: raw.messageId,
      userId: raw.userId,
      rating: raw.rating as FeedbackRating,
      explanation: raw.explanation,
      category: raw.category,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }

  public static toPrismaUncheckedCreate(
    domain: AiMessageFeedback,
  ): Prisma.AiMessageFeedbackUncheckedCreateInput {
    return {
      id: domain.id.value,
      tenantId: domain.tenantId,
      conversationId: domain.conversationId.value,
      messageId: domain.messageId.value,
      userId: domain.userId,
      rating: domain.rating as PrismaFeedbackRating,
      explanation: domain.explanation,
      category: domain.category,
      createdAt: domain.createdAt,
      updatedAt: domain.updatedAt,
    };
  }
}
