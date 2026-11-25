import { FeedbackId } from '../value-objects/feedback-id.vo';
import { MessageId } from '../value-objects/message-id.vo';
import { ConversationId } from '../value-objects/conversation-id.vo';
import { FeedbackRating } from '../enums/feedback-rating.enum';
import { InvalidConversationTurnException } from '../exceptions/conversation.exceptions';

export interface CreateAiMessageFeedbackProps {
  id?: FeedbackId | string;
  tenantId: string;
  conversationId: ConversationId | string;
  messageId: MessageId | string;
  userId: string;
  rating: FeedbackRating;
  explanation?: string | null;
  category?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ReconstituteAiMessageFeedbackProps {
  id: FeedbackId | string;
  tenantId: string;
  conversationId: ConversationId | string;
  messageId: MessageId | string;
  userId: string;
  rating: FeedbackRating;
  explanation: string | null;
  category: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const MAX_FEEDBACK_EXPLANATION_LENGTH = 1000;
export const MAX_FEEDBACK_CATEGORY_LENGTH = 64;

/**
 * Domain entity representing user feedback on an AI assistant response.
 *
 * Invariants:
 * - Must belong to an authenticated user and valid tenant.
 * - Must reference an existing conversation and assistant message.
 * - Rating must be an explicit FeedbackRating (POSITIVE or NEGATIVE).
 * - Optional explanation is trimmed and capped at 1000 characters.
 * - Optional category is trimmed and capped at 64 characters.
 */
export class AiMessageFeedback {
  private readonly _id: FeedbackId;
  private readonly _tenantId: string;
  private readonly _conversationId: ConversationId;
  private readonly _messageId: MessageId;
  private readonly _userId: string;
  private _rating: FeedbackRating;
  private _explanation: string | null;
  private _category: string | null;
  private readonly _createdAt: Date;
  private _updatedAt: Date;

  private constructor(props: ReconstituteAiMessageFeedbackProps) {
    this._id = props.id instanceof FeedbackId ? props.id : FeedbackId.create(props.id);

    if (
      !props.tenantId ||
      typeof props.tenantId !== 'string' ||
      props.tenantId.trim().length === 0
    ) {
      throw new InvalidConversationTurnException('Tenant ID is required for message feedback.');
    }
    this._tenantId = props.tenantId.trim();

    this._conversationId =
      props.conversationId instanceof ConversationId
        ? props.conversationId
        : ConversationId.create(props.conversationId);

    this._messageId =
      props.messageId instanceof MessageId ? props.messageId : MessageId.create(props.messageId);

    if (!props.userId || typeof props.userId !== 'string' || props.userId.trim().length === 0) {
      throw new InvalidConversationTurnException('User ID is required for message feedback.');
    }
    this._userId = props.userId.trim();

    this._rating = this.validateRating(props.rating);
    this._explanation = this.sanitizeExplanation(props.explanation);
    this._category = this.sanitizeCategory(props.category);
    this._createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
  }

  public static create(props: CreateAiMessageFeedbackProps): AiMessageFeedback {
    const now = new Date();
    return new AiMessageFeedback({
      id: props.id
        ? props.id instanceof FeedbackId
          ? props.id
          : FeedbackId.create(props.id)
        : FeedbackId.create(),
      tenantId: props.tenantId,
      conversationId: props.conversationId,
      messageId: props.messageId,
      userId: props.userId,
      rating: props.rating,
      explanation: props.explanation ?? null,
      category: props.category ?? null,
      createdAt: props.createdAt ?? now,
      updatedAt: props.updatedAt ?? now,
    });
  }

  public static reconstitute(props: ReconstituteAiMessageFeedbackProps): AiMessageFeedback {
    return new AiMessageFeedback(props);
  }

  public get id(): FeedbackId {
    return this._id;
  }

  public get tenantId(): string {
    return this._tenantId;
  }

  public get conversationId(): ConversationId {
    return this._conversationId;
  }

  public get messageId(): MessageId {
    return this._messageId;
  }

  public get userId(): string {
    return this._userId;
  }

  public get rating(): FeedbackRating {
    return this._rating;
  }

  public get explanation(): string | null {
    return this._explanation;
  }

  public get category(): string | null {
    return this._category;
  }

  public get createdAt(): Date {
    return this._createdAt;
  }

  public get updatedAt(): Date {
    return this._updatedAt;
  }

  /**
   * Updates rating, explanation, and category.
   * Modifies updatedAt to current timestamp.
   */
  public update(
    rating: FeedbackRating,
    explanation?: string | null,
    category?: string | null,
  ): void {
    this._rating = this.validateRating(rating);
    if (explanation !== undefined) {
      this._explanation = this.sanitizeExplanation(explanation);
    }
    if (category !== undefined) {
      this._category = this.sanitizeCategory(category);
    }
    this._updatedAt = new Date();
  }

  private validateRating(rating: FeedbackRating): FeedbackRating {
    if (!rating || (rating !== FeedbackRating.POSITIVE && rating !== FeedbackRating.NEGATIVE)) {
      throw new InvalidConversationTurnException(
        `Invalid feedback rating '${String(rating)}'. Rating must be POSITIVE or NEGATIVE.`,
      );
    }
    return rating;
  }

  private sanitizeExplanation(explanation?: string | null): string | null {
    if (explanation === undefined || explanation === null) {
      return null;
    }
    if (typeof explanation !== 'string') {
      throw new InvalidConversationTurnException('Explanation must be a string.');
    }
    const trimmed = explanation.trim();
    if (trimmed.length === 0) {
      return null;
    }
    if (trimmed.length > MAX_FEEDBACK_EXPLANATION_LENGTH) {
      throw new InvalidConversationTurnException(
        `Explanation cannot exceed ${MAX_FEEDBACK_EXPLANATION_LENGTH} characters. Received ${trimmed.length}.`,
      );
    }
    return trimmed;
  }

  private sanitizeCategory(category?: string | null): string | null {
    if (category === undefined || category === null) {
      return null;
    }
    if (typeof category !== 'string') {
      throw new InvalidConversationTurnException('Category must be a string.');
    }
    const trimmed = category.trim();
    if (trimmed.length === 0) {
      return null;
    }
    if (trimmed.length > MAX_FEEDBACK_CATEGORY_LENGTH) {
      throw new InvalidConversationTurnException(
        `Category cannot exceed ${MAX_FEEDBACK_CATEGORY_LENGTH} characters. Received ${trimmed.length}.`,
      );
    }
    return trimmed;
  }
}
