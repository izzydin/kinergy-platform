import { IAiConversationRepositoryPort } from '../../ports/outbound/ai-conversation-repository.port';
import { IAiConversationMessageRepositoryPort } from '../../ports/outbound/ai-conversation-message-repository.port';
import { IAiMessageFeedbackRepositoryPort } from '../../ports/outbound/ai-message-feedback-repository.port';
import { AiMessageFeedback } from '../../domain/models/ai-message-feedback.entity';
import {
  GetMessageFeedbackInput,
  GetMessageFeedbackResult,
  MessageFeedbackDto,
} from '../dtos/ai-conversation.dtos';
import {
  ConversationNotFoundError,
  TenantOwnershipViolationError,
  MessageNotFoundError,
  MessageNotBelongingToConversationError,
  InvalidFeedbackInputError,
} from '../errors/ai-conversation-application.error';

/**
 * Use case to retrieve feedback submitted by a user on an assistant message.
 */
export class GetMessageFeedbackUseCase {
  constructor(
    private readonly convRepo: IAiConversationRepositoryPort,
    private readonly messageRepo: IAiConversationMessageRepositoryPort,
    private readonly feedbackRepo: IAiMessageFeedbackRepositoryPort,
  ) {}

  public async execute(input: GetMessageFeedbackInput): Promise<GetMessageFeedbackResult> {
    if (!input) {
      throw new InvalidFeedbackInputError('input', 'Feedback input cannot be null or undefined.');
    }

    const tenantId = input.tenantId?.trim();
    if (!tenantId) {
      throw new InvalidFeedbackInputError('tenantId', 'Tenant ID is required.');
    }

    const userId = input.userId?.trim();
    if (!userId) {
      throw new InvalidFeedbackInputError('userId', 'User ID is required.');
    }

    const conversationId = input.conversationId?.trim();
    if (!conversationId) {
      throw new InvalidFeedbackInputError('conversationId', 'Conversation ID is required.');
    }

    const messageId = input.messageId?.trim();
    if (!messageId) {
      throw new InvalidFeedbackInputError('messageId', 'Message ID is required.');
    }

    // 1. Verify Conversation & Ownership
    const conversation = await this.convRepo.findById(tenantId, conversationId);
    if (!conversation) {
      throw new ConversationNotFoundError(conversationId, tenantId);
    }

    if (conversation.tenantId !== tenantId) {
      throw new TenantOwnershipViolationError('AiConversation', conversationId, tenantId);
    }

    if (conversation.userId !== userId) {
      throw new TenantOwnershipViolationError('AiConversation', conversationId, tenantId);
    }

    // 2. Verify Message
    const message = await this.messageRepo.findById(tenantId, conversationId, messageId);
    if (!message) {
      if (this.messageRepo.findMessageById) {
        const anyMessage = await this.messageRepo.findMessageById(tenantId, messageId);
        if (anyMessage && anyMessage.conversationId.value !== conversationId) {
          throw new MessageNotBelongingToConversationError(messageId, conversationId);
        }
      }
      throw new MessageNotFoundError(messageId, undefined, conversationId);
    }

    if (message.conversationId.value !== conversationId) {
      throw new MessageNotBelongingToConversationError(messageId, conversationId);
    }

    // 3. Retrieve Feedback
    const feedback = await this.feedbackRepo.findByMessageAndUser(
      tenantId,
      conversationId,
      messageId,
      userId,
    );

    return {
      feedback: feedback ? this.toDto(feedback) : null,
    };
  }

  private toDto(entity: AiMessageFeedback): MessageFeedbackDto {
    return {
      id: entity.id.value,
      messageId: entity.messageId.value,
      conversationId: entity.conversationId.value,
      userId: entity.userId,
      rating: entity.rating,
      explanation: entity.explanation,
      category: entity.category,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
