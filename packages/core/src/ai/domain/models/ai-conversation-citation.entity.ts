import { CitationId } from '../value-objects/citation-id.vo';
import { MessageId } from '../value-objects/message-id.vo';
import { TurnId } from '../value-objects/turn-id.vo';
import { ConversationId } from '../value-objects/conversation-id.vo';
import {
  InvalidConversationTurnException,
  InvalidMessageInvariantException,
} from '../exceptions/conversation.exceptions';

export interface CreateAiConversationCitationProps {
  id?: CitationId | string;
  messageId: MessageId | string;
  turnId: TurnId | string;
  conversationId: ConversationId | string;
  tenantId: string;
  documentId: string;
  documentVersionId?: string | null;
  chunkId?: string | null;
  citationPosition: number;
  documentTitleSnapshot: string;
  excerpt: string;
  pageNumber?: number | null;
  headingPath?: readonly string[] | null;
  retrievalRank?: number | null;
  relevanceScore?: number | null;
  sourceStrategy?: string | null;
  metadata?: Readonly<Record<string, unknown>> | null;
  createdAt?: Date;
}

export interface ReconstituteAiConversationCitationProps {
  id: CitationId | string;
  messageId: MessageId | string;
  turnId: TurnId | string;
  conversationId: ConversationId | string;
  tenantId: string;
  documentId: string;
  documentVersionId: string | null;
  chunkId: string | null;
  citationPosition: number;
  documentTitleSnapshot: string;
  excerpt: string;
  pageNumber: number | null;
  headingPath: readonly string[];
  retrievalRank: number | null;
  relevanceScore: number | null;
  sourceStrategy: string | null;
  metadata: Readonly<Record<string, unknown>> | null;
  createdAt: Date;
}

/**
 * Domain entity representing an immutable, persistent citation tied to an assistant message.
 *
 * Invariants:
 * - A citation belongs strictly to an assistant message and its parent conversation turn.
 * - citationPosition >= 1 (1-based deterministic appearance order).
 * - excerpt must be non-empty text, capturing the exact retrieved evidence segment.
 * - documentTitleSnapshot captures the title as it was at generation time,
 *   preserving clinical provenance even if the document is subsequently renamed or deleted.
 * - relevanceScore, when present, is bounded to [0.0, 1.0].
 * - pageNumber, when present, must be >= 1.
 */
export class AiConversationCitation {
  private readonly _id: CitationId;
  private readonly _messageId: MessageId;
  private readonly _turnId: TurnId;
  private readonly _conversationId: ConversationId;
  private readonly _tenantId: string;
  private readonly _documentId: string;
  private readonly _documentVersionId: string | null;
  private readonly _chunkId: string | null;
  private readonly _citationPosition: number;
  private readonly _documentTitleSnapshot: string;
  private readonly _excerpt: string;
  private readonly _pageNumber: number | null;
  private readonly _headingPath: readonly string[];
  private readonly _retrievalRank: number | null;
  private readonly _relevanceScore: number | null;
  private readonly _sourceStrategy: string | null;
  private readonly _metadata: Readonly<Record<string, unknown>> | null;
  private readonly _createdAt: Date;

  private constructor(props: ReconstituteAiConversationCitationProps) {
    if (
      !props.tenantId ||
      typeof props.tenantId !== 'string' ||
      props.tenantId.trim().length === 0
    ) {
      throw new InvalidConversationTurnException('Citation tenantId cannot be empty.');
    }
    if (
      !props.documentId ||
      typeof props.documentId !== 'string' ||
      props.documentId.trim().length === 0
    ) {
      throw new InvalidMessageInvariantException('Citation documentId cannot be empty.');
    }
    if (
      !props.documentTitleSnapshot ||
      typeof props.documentTitleSnapshot !== 'string' ||
      props.documentTitleSnapshot.trim().length === 0
    ) {
      throw new InvalidMessageInvariantException('Citation documentTitleSnapshot cannot be empty.');
    }
    if (!props.excerpt || typeof props.excerpt !== 'string' || props.excerpt.trim().length === 0) {
      throw new InvalidMessageInvariantException('Citation excerpt cannot be empty.');
    }
    if (
      typeof props.citationPosition !== 'number' ||
      !Number.isInteger(props.citationPosition) ||
      props.citationPosition < 1
    ) {
      throw new InvalidMessageInvariantException(
        `Citation citationPosition must be an integer >= 1, received: ${props.citationPosition}`,
      );
    }
    if (props.pageNumber !== null && props.pageNumber !== undefined) {
      if (!Number.isInteger(props.pageNumber) || props.pageNumber < 1) {
        throw new InvalidMessageInvariantException(
          `Citation pageNumber must be a positive integer >= 1, received: ${props.pageNumber}`,
        );
      }
    }
    if (props.relevanceScore !== null && props.relevanceScore !== undefined) {
      if (
        typeof props.relevanceScore !== 'number' ||
        Number.isNaN(props.relevanceScore) ||
        props.relevanceScore < 0.0 ||
        props.relevanceScore > 1.0
      ) {
        throw new InvalidMessageInvariantException(
          `Citation relevanceScore must be between 0.0 and 1.0, received: ${props.relevanceScore}`,
        );
      }
    }

    this._id = props.id instanceof CitationId ? props.id : CitationId.create(props.id);
    this._messageId =
      props.messageId instanceof MessageId ? props.messageId : MessageId.create(props.messageId);
    this._turnId = props.turnId instanceof TurnId ? props.turnId : TurnId.create(props.turnId);
    this._conversationId =
      props.conversationId instanceof ConversationId
        ? props.conversationId
        : ConversationId.create(props.conversationId);
    this._tenantId = props.tenantId.trim();
    this._documentId = props.documentId.trim();
    this._documentVersionId = props.documentVersionId ? props.documentVersionId.trim() : null;
    this._chunkId = props.chunkId ? props.chunkId.trim() : null;
    this._citationPosition = props.citationPosition;
    this._documentTitleSnapshot = props.documentTitleSnapshot.trim();
    this._excerpt = props.excerpt.trim();
    this._pageNumber = props.pageNumber ?? null;
    this._headingPath = Object.freeze([...(props.headingPath ?? [])]);
    this._retrievalRank = props.retrievalRank ?? null;
    this._relevanceScore =
      props.relevanceScore !== null && props.relevanceScore !== undefined
        ? Math.round(props.relevanceScore * 10000) / 10000
        : null;
    this._sourceStrategy = props.sourceStrategy ? props.sourceStrategy.trim() : null;
    this._metadata = props.metadata ? { ...props.metadata } : null;
    this._createdAt = props.createdAt;
    Object.freeze(this);
  }

  public static create(props: CreateAiConversationCitationProps): AiConversationCitation {
    const now = new Date();
    return new AiConversationCitation({
      id: props.id instanceof CitationId ? props.id : CitationId.create(props.id),
      messageId: props.messageId,
      turnId: props.turnId,
      conversationId: props.conversationId,
      tenantId: props.tenantId,
      documentId: props.documentId,
      documentVersionId: props.documentVersionId ?? null,
      chunkId: props.chunkId ?? null,
      citationPosition: props.citationPosition,
      documentTitleSnapshot: props.documentTitleSnapshot,
      excerpt: props.excerpt,
      pageNumber: props.pageNumber ?? null,
      headingPath: props.headingPath ?? [],
      retrievalRank: props.retrievalRank ?? null,
      relevanceScore: props.relevanceScore ?? null,
      sourceStrategy: props.sourceStrategy ?? null,
      metadata: props.metadata ?? null,
      createdAt: props.createdAt ?? now,
    });
  }

  public static reconstitute(
    props: ReconstituteAiConversationCitationProps,
  ): AiConversationCitation {
    return new AiConversationCitation(props);
  }

  public get id(): CitationId {
    return this._id;
  }

  public get messageId(): MessageId {
    return this._messageId;
  }

  public get turnId(): TurnId {
    return this._turnId;
  }

  public get conversationId(): ConversationId {
    return this._conversationId;
  }

  public get tenantId(): string {
    return this._tenantId;
  }

  public get documentId(): string {
    return this._documentId;
  }

  public get documentVersionId(): string | null {
    return this._documentVersionId;
  }

  public get chunkId(): string | null {
    return this._chunkId;
  }

  public get citationPosition(): number {
    return this._citationPosition;
  }

  public get documentTitleSnapshot(): string {
    return this._documentTitleSnapshot;
  }

  public get excerpt(): string {
    return this._excerpt;
  }

  public get pageNumber(): number | null {
    return this._pageNumber;
  }

  public get headingPath(): readonly string[] {
    return this._headingPath;
  }

  public get retrievalRank(): number | null {
    return this._retrievalRank;
  }

  public get relevanceScore(): number | null {
    return this._relevanceScore;
  }

  public get sourceStrategy(): string | null {
    return this._sourceStrategy;
  }

  public get metadata(): Readonly<Record<string, unknown>> | null {
    return this._metadata;
  }

  public get createdAt(): Date {
    return this._createdAt;
  }
}
