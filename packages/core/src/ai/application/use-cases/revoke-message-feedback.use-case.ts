import { IAiConversationRepositoryPort } from '../../ports/outbound/ai-conversation-repository.port';
import { IAiConversationMessageRepositoryPort } from '../../ports/outbound/ai-conversation-message-repository.port';
import { IAiMessageFeedbackRepositoryPort } from '../../ports/outbound/ai-message-feedback-repository.port';
import {
  RevokeMessageFeedbackInput,
  RevokeMessageFeedbackResult,
} from '../dtos/ai-conversation.dtos';
import {
  ConversationNotFoundError,
  TenantOwnershipViolationError,
  MessageNotFoundError,
  MessageNotBelongingToConversationError,
  InvalidFeedbackInputError,
} from '../errors/ai-conversation-application.error';

/**
 * Use case to delete/revoke user feedback on an assistant message.
 */
export class RevokeMessageFeedbackUseCase {
  constructor(
    private readonly convRepo: IAiConversationRepositoryPort,
    private readonly messageRepo: IAiConversationMessageRepositoryPort,
    private readonly feedbackRepo: IAiMessageFeedbackRepositoryPort,
  ) {}

  public async execute(input: RevokeMessageFeedbackInput): Promise<RevokeMessageFeedbackResult> {
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

    // 3. Delete Feedback
    const revoked = await this.feedbackRepo.deleteByMessageAndUser(
      tenantId,
      conversationId,
      messageId,
      userId,
    );

    return {
      revoked,
      messageId,
    };
  }
}
