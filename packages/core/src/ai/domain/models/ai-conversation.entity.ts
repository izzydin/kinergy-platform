import { ConversationId } from '../value-objects/conversation-id.vo';
import { ConversationTitle } from '../value-objects/conversation-title.vo';
import { InvalidConversationTurnException } from '../exceptions/conversation.exceptions';

export interface CreateAiConversationProps {
  id?: ConversationId | string;
  tenantId: string;
  userId: string;
  title?: ConversationTitle | string;
  idempotencyKey?: string | null;
  turnCounter?: number;
  messageCounter?: number;
  lastActivityAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date | null;
}

export interface ReconstituteAiConversationProps {
  id: ConversationId | string;
  tenantId: string;
  userId: string;
  title: ConversationTitle | string;
  idempotencyKey: string | null;
  turnCounter: number;
  messageCounter: number;
  lastActivityAt: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/**
 * Aggregate Root representing an AI Conversation session within a tenant boundary.
 *
 * Invariants:
 * - Strictly partitioned by tenantId and owned by userId.
 * - Manages sequence counters (turnCounter, messageCounter) for atomic, monotonically increasing IDs.
 * - Supports soft-deletion (archive / unarchive).
 */
export class AiConversation {
  private readonly _id: ConversationId;
  private readonly _tenantId: string;
  private readonly _userId: string;
  private _title: ConversationTitle;
  private readonly _idempotencyKey: string | null;
  private _turnCounter: number;
  private _messageCounter: number;
  private _lastActivityAt: Date;
  private readonly _createdAt: Date;
  private _updatedAt: Date;
  private _deletedAt: Date | null;

  private constructor(props: ReconstituteAiConversationProps) {
    if (
      !props.tenantId ||
      typeof props.tenantId !== 'string' ||
      props.tenantId.trim().length === 0
    ) {
      throw new InvalidConversationTurnException('Conversation tenantId cannot be empty.');
    }
    if (!props.userId || typeof props.userId !== 'string' || props.userId.trim().length === 0) {
      throw new InvalidConversationTurnException('Conversation userId cannot be empty.');
    }
    if (props.turnCounter < 0 || !Number.isInteger(props.turnCounter)) {
      throw new InvalidConversationTurnException(
        'Conversation turnCounter must be a non-negative integer.',
      );
    }
    if (props.messageCounter < 0 || !Number.isInteger(props.messageCounter)) {
      throw new InvalidConversationTurnException(
        'Conversation messageCounter must be a non-negative integer.',
      );
    }

    this._id = props.id instanceof ConversationId ? props.id : ConversationId.create(props.id);
    this._tenantId = props.tenantId.trim();
    this._userId = props.userId.trim();
    this._title =
      props.title instanceof ConversationTitle
        ? props.title
        : ConversationTitle.create(props.title);
    this._idempotencyKey = props.idempotencyKey ? props.idempotencyKey.trim() : null;
    this._turnCounter = props.turnCounter;
    this._messageCounter = props.messageCounter;
    this._lastActivityAt = props.lastActivityAt;
    this._createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
    this._deletedAt = props.deletedAt;
  }

  public static create(props: CreateAiConversationProps): AiConversation {
    const now = new Date();
    return new AiConversation({
      id: props.id instanceof ConversationId ? props.id : ConversationId.create(props.id),
      tenantId: props.tenantId,
      userId: props.userId,
      title:
        props.title instanceof ConversationTitle
          ? props.title
          : ConversationTitle.create(props.title),
      idempotencyKey: props.idempotencyKey ?? null,
      turnCounter: props.turnCounter ?? 0,
      messageCounter: props.messageCounter ?? 0,
      lastActivityAt: props.lastActivityAt ?? now,
      createdAt: props.createdAt ?? now,
      updatedAt: props.updatedAt ?? now,
      deletedAt: props.deletedAt ?? null,
    });
  }

  /**
   * Factory method to create an AiConversation with its initial title derived
   * from the first user prompt (truncated to 40 characters per domain rules).
   */
  public static createFromInitialPrompt(
    props: Omit<CreateAiConversationProps, 'title'> & { prompt: string },
  ): AiConversation {
    return AiConversation.create({
      ...props,
      title: ConversationTitle.deriveFromPrompt(props.prompt),
    });
  }

  public static reconstitute(props: ReconstituteAiConversationProps): AiConversation {
    return new AiConversation(props);
  }

  public get id(): ConversationId {
    return this._id;
  }

  public get tenantId(): string {
    return this._tenantId;
  }

  public get userId(): string {
    return this._userId;
  }

  public get title(): ConversationTitle {
    return this._title;
  }

  public get idempotencyKey(): string | null {
    return this._idempotencyKey;
  }

  public get turnCounter(): number {
    return this._turnCounter;
  }

  public get messageCounter(): number {
    return this._messageCounter;
  }

  public get lastActivityAt(): Date {
    return this._lastActivityAt;
  }

  public get createdAt(): Date {
    return this._createdAt;
  }

  public get updatedAt(): Date {
    return this._updatedAt;
  }

  public get deletedAt(): Date | null {
    return this._deletedAt;
  }

  public isArchived(): boolean {
    return this._deletedAt !== null;
  }

  public updateTitle(newTitle: ConversationTitle | string): void {
    this._title =
      newTitle instanceof ConversationTitle ? newTitle : ConversationTitle.create(newTitle);
    this._updatedAt = new Date();
  }

  public archive(at?: Date): void {
    const timestamp = at ?? new Date();
    this._deletedAt = timestamp;
    this._updatedAt = timestamp;
  }

  public unarchive(): void {
    this._deletedAt = null;
    this._updatedAt = new Date();
  }

  public recordActivity(at?: Date): void {
    const timestamp = at ?? new Date();
    this._lastActivityAt = timestamp;
    this._updatedAt = timestamp;
  }

  public incrementTurnCounter(): number {
    this._turnCounter += 1;
    this._updatedAt = new Date();
    return this._turnCounter;
  }

  public incrementMessageCounter(): number {
    this._messageCounter += 1;
    this._updatedAt = new Date();
    return this._messageCounter;
  }
}
