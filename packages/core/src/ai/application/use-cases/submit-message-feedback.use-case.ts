import { IAiConversationRepositoryPort } from '../../ports/outbound/ai-conversation-repository.port';
import { IAiConversationMessageRepositoryPort } from '../../ports/outbound/ai-conversation-message-repository.port';
import { IAiMessageFeedbackRepositoryPort } from '../../ports/outbound/ai-message-feedback-repository.port';
import { AiMessageFeedback } from '../../domain/models/ai-message-feedback.entity';
import { ConversationRole } from '../../domain/enums/conversation-role.enum';
import {
  SubmitMessageFeedbackInput,
  SubmitMessageFeedbackResult,
  MessageFeedbackDto,
} from '../dtos/ai-conversation.dtos';
import {
  ConversationNotFoundError,
  TenantOwnershipViolationError,
  MessageNotFoundError,
  MessageNotBelongingToConversationError,
  FeedbackTargetNotAssistantMessageError,
  InvalidFeedbackInputError,
} from '../errors/ai-conversation-application.error';

/**
 * Use case to submit or update feedback on an assistant message.
 *
 * Invariants & Guarantees:
 * - Verifies caller ownership and tenant isolation.
 * - Enforces that the target message exists and belongs strictly to the target conversation.
 * - Enforces that feedback is strictly restricted to ASSISTANT responses (user messages are rejected).
 * - Enforces idempotency: updating an existing rating updates the existing record rather than duplicating.
 */
export class SubmitMessageFeedbackUseCase {
  constructor(
    private readonly convRepo: IAiConversationRepositoryPort,
    private readonly messageRepo: IAiConversationMessageRepositoryPort,
    private readonly feedbackRepo: IAiMessageFeedbackRepositoryPort,
  ) {}

  public async execute(input: SubmitMessageFeedbackInput): Promise<SubmitMessageFeedbackResult> {
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

    if (!input.rating) {
      throw new InvalidFeedbackInputError('rating', 'Feedback rating is required.');
    }

    // 1. Verify Conversation Existence & Tenant/User Ownership
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

    // 2. Verify Message Existence & Association with Target Conversation
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

    // 3. Reject Feedback on Non-Assistant Messages
    if (message.role !== ConversationRole.ASSISTANT) {
      throw new FeedbackTargetNotAssistantMessageError(messageId, message.role);
    }

    // 4. Idempotent Upsert: Check if existing feedback exists for this user & message
    const existingFeedback = await this.feedbackRepo.findByMessageAndUser(
      tenantId,
      conversationId,
      messageId,
      userId,
    );

    let savedFeedback: AiMessageFeedback;
    let isUpdate = false;

    if (existingFeedback) {
      existingFeedback.update(input.rating, input.explanation, input.category);
      savedFeedback = await this.feedbackRepo.save(existingFeedback);
      isUpdate = true;
    } else {
      const newFeedback = AiMessageFeedback.create({
        tenantId,
        conversationId,
        messageId,
        userId,
        rating: input.rating,
        explanation: input.explanation,
        category: input.category,
      });
      savedFeedback = await this.feedbackRepo.save(newFeedback);
    }

    return {
      feedback: this.toDto(savedFeedback),
      isUpdate,
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
