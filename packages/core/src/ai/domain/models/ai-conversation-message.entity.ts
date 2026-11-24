import { MessageId } from '../value-objects/message-id.vo';
import { TurnId } from '../value-objects/turn-id.vo';
import { ConversationId } from '../value-objects/conversation-id.vo';
import { ConversationRole } from '../enums/conversation-role.enum';
import { GenerationStatus } from '../enums/generation-status.enum';
import {
  InvalidConversationTurnException,
  InvalidMessageInvariantException,
  InvalidCanonicalDesignationException,
  InvalidLifecycleTransitionException,
} from '../exceptions/conversation.exceptions';

export interface CreateAiConversationMessageProps {
  id?: MessageId | string;
  turnId: TurnId | string;
  conversationId: ConversationId | string;
  tenantId: string;
  role: ConversationRole;
  sequenceNumber: number;
  attemptNumber?: number;
  isCanonical?: boolean;
  status?: GenerationStatus;
  content?: string;
  sources?: ReadonlyArray<Record<string, unknown>> | null;
  metadata?: Readonly<Record<string, unknown>> | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  clientMessageId?: string | null;
  leaseToken?: string | null;
  leaseOwnerInstanceId?: string | null;
  leaseExpiresAt?: Date | null;
  createdAt?: Date;
  completedAt?: Date | null;
  updatedAt?: Date;
}

export interface ReconstituteAiConversationMessageProps {
  id: MessageId | string;
  turnId: TurnId | string;
  conversationId: ConversationId | string;
  tenantId: string;
  role: ConversationRole;
  sequenceNumber: number;
  attemptNumber: number;
  isCanonical: boolean;
  status: GenerationStatus;
  content: string;
  sources: ReadonlyArray<Record<string, unknown>> | null;
  metadata: Readonly<Record<string, unknown>> | null;
  errorCode: string | null;
  errorMessage: string | null;
  clientMessageId: string | null;
  leaseToken: string | null;
  leaseOwnerInstanceId: string | null;
  leaseExpiresAt: Date | null;
  createdAt: Date;
  completedAt: Date | null;
  updatedAt: Date;
}

/**
 * Domain entity representing an individual message or generation attempt in a conversation turn.
 *
 * Invariants:
 * - sequenceNumber >= 1
 * - attemptNumber >= 1
 * - For role === 'USER', status must be 'SUCCESS', attemptNumber must be 1, and isCanonical must be false.
 *   (Canonical applies strictly to assistant responses in the schema and check constraints).
 */
export class AiConversationMessage {
  private readonly _id: MessageId;
  private readonly _turnId: TurnId;
  private readonly _conversationId: ConversationId;
  private readonly _tenantId: string;
  private readonly _role: ConversationRole;
  private readonly _sequenceNumber: number;
  private readonly _attemptNumber: number;
  private _isCanonical: boolean;
  private _status: GenerationStatus;
  private _content: string;
  private _sources: ReadonlyArray<Record<string, unknown>> | null;
  private _metadata: Readonly<Record<string, unknown>> | null;
  private _errorCode: string | null;
  private _errorMessage: string | null;
  private readonly _clientMessageId: string | null;
  private _leaseToken: string | null;
  private _leaseOwnerInstanceId: string | null;
  private _leaseExpiresAt: Date | null;
  private readonly _createdAt: Date;
  private _completedAt: Date | null;
  private _updatedAt: Date;

  private constructor(props: ReconstituteAiConversationMessageProps) {
    if (
      !props.tenantId ||
      typeof props.tenantId !== 'string' ||
      props.tenantId.trim().length === 0
    ) {
      throw new InvalidConversationTurnException('Message tenantId cannot be empty.');
    }
    if (
      typeof props.sequenceNumber !== 'number' ||
      !Number.isInteger(props.sequenceNumber) ||
      props.sequenceNumber < 1
    ) {
      throw new InvalidMessageInvariantException(
        `Message sequenceNumber must be an integer >= 1, received: ${props.sequenceNumber}`,
      );
    }
    if (
      typeof props.attemptNumber !== 'number' ||
      !Number.isInteger(props.attemptNumber) ||
      props.attemptNumber < 1
    ) {
      throw new InvalidMessageInvariantException(
        `Message attemptNumber must be an integer >= 1, received: ${props.attemptNumber}`,
      );
    }

    // Role-specific invariants
    if (props.role === ConversationRole.USER) {
      if (props.status !== GenerationStatus.SUCCESS) {
        throw new InvalidMessageInvariantException('USER message must have status SUCCESS.');
      }
      if (props.attemptNumber !== 1) {
        throw new InvalidMessageInvariantException('USER message must have attemptNumber 1.');
      }
      if (props.isCanonical) {
        throw new InvalidMessageInvariantException(
          'USER message cannot be canonical (isCanonical must be false).',
        );
      }
    }

    this._id = props.id instanceof MessageId ? props.id : MessageId.create(props.id);
    this._turnId = props.turnId instanceof TurnId ? props.turnId : TurnId.create(props.turnId);
    this._conversationId =
      props.conversationId instanceof ConversationId
        ? props.conversationId
        : ConversationId.create(props.conversationId);
    this._tenantId = props.tenantId.trim();
    this._role = props.role;
    this._sequenceNumber = props.sequenceNumber;
    this._attemptNumber = props.attemptNumber;
    this._isCanonical = props.isCanonical;
    this._status = props.status;
    this._content = props.content ?? '';
    this._sources = props.sources ? [...props.sources] : null;
    this._metadata = props.metadata ? { ...props.metadata } : null;
    this._errorCode = props.errorCode ?? null;
    this._errorMessage = props.errorMessage ?? null;
    this._clientMessageId = props.clientMessageId ? props.clientMessageId.trim() : null;
    this._leaseToken = props.leaseToken ?? null;
    this._leaseOwnerInstanceId = props.leaseOwnerInstanceId ?? null;
    this._leaseExpiresAt = props.leaseExpiresAt ?? null;
    this._createdAt = props.createdAt;
    this._completedAt = props.completedAt;
    this._updatedAt = props.updatedAt;
  }

  public static create(props: CreateAiConversationMessageProps): AiConversationMessage {
    const now = new Date();
    const isUser = props.role === ConversationRole.USER;

    return new AiConversationMessage({
      id: props.id instanceof MessageId ? props.id : MessageId.create(props.id),
      turnId: props.turnId,
      conversationId: props.conversationId,
      tenantId: props.tenantId,
      role: props.role,
      sequenceNumber: props.sequenceNumber,
      attemptNumber: isUser ? 1 : (props.attemptNumber ?? 1),
      isCanonical: isUser ? false : (props.isCanonical ?? false),
      status: isUser ? GenerationStatus.SUCCESS : (props.status ?? GenerationStatus.PENDING),
      content: props.content ?? '',
      sources: props.sources ?? null,
      metadata: props.metadata ?? null,
      errorCode: props.errorCode ?? null,
      errorMessage: props.errorMessage ?? null,
      clientMessageId: props.clientMessageId ?? null,
      leaseToken: props.leaseToken ?? null,
      leaseOwnerInstanceId: props.leaseOwnerInstanceId ?? null,
      leaseExpiresAt: props.leaseExpiresAt ?? null,
      createdAt: props.createdAt ?? now,
      completedAt: isUser ? (props.completedAt ?? now) : (props.completedAt ?? null),
      updatedAt: props.updatedAt ?? now,
    });
  }

  public static reconstitute(props: ReconstituteAiConversationMessageProps): AiConversationMessage {
    return new AiConversationMessage(props);
  }

  public get id(): MessageId {
    return this._id;
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

  public get role(): ConversationRole {
    return this._role;
  }

  public get sequenceNumber(): number {
    return this._sequenceNumber;
  }

  public get attemptNumber(): number {
    return this._attemptNumber;
  }

  public get isCanonical(): boolean {
    return this._isCanonical;
  }

  public get status(): GenerationStatus {
    return this._status;
  }

  public get content(): string {
    return this._content;
  }

  public get sources(): ReadonlyArray<Record<string, unknown>> | null {
    return this._sources;
  }

  public get metadata(): Readonly<Record<string, unknown>> | null {
    return this._metadata;
  }

  public get errorCode(): string | null {
    return this._errorCode;
  }

  public get errorMessage(): string | null {
    return this._errorMessage;
  }

  public get clientMessageId(): string | null {
    return this._clientMessageId;
  }

  public get leaseToken(): string | null {
    return this._leaseToken;
  }

  public get leaseOwnerInstanceId(): string | null {
    return this._leaseOwnerInstanceId;
  }

  public get leaseExpiresAt(): Date | null {
    return this._leaseExpiresAt;
  }

  public get createdAt(): Date {
    return this._createdAt;
  }

  public get completedAt(): Date | null {
    return this._completedAt;
  }

  public get updatedAt(): Date {
    return this._updatedAt;
  }

  public isTerminal(): boolean {
    return (
      this._status === GenerationStatus.SUCCESS ||
      this._status === GenerationStatus.FAILED ||
      this._status === GenerationStatus.CANCELLED ||
      this._status === GenerationStatus.INTERRUPTED
    );
  }

  public appendContentChunk(chunk: string): void {
    if (this.isTerminal()) {
      throw new InvalidLifecycleTransitionException(
        `Cannot append content to message '${this._id.value}' in terminal status '${this._status}'.`,
      );
    }
    this._content += chunk;
    this._status = GenerationStatus.STREAMING;
    this._updatedAt = new Date();
  }

  public complete(
    content: string,
    sources?: Record<string, unknown>[],
    metadata?: Record<string, unknown>,
  ): void {
    const now = new Date();
    this._content = content;
    this._status = GenerationStatus.SUCCESS;
    if (sources !== undefined) {
      this._sources = sources;
    }
    if (metadata !== undefined) {
      this._metadata = metadata;
    }
    this._completedAt = now;
    this._leaseExpiresAt = null;
    this._leaseToken = null;
    this._leaseOwnerInstanceId = null;
    this._updatedAt = now;
  }

  public fail(errorCode: string, errorMessage: string): void {
    const now = new Date();
    this._status = GenerationStatus.FAILED;
    this._errorCode = errorCode;
    this._errorMessage = errorMessage;
    this._leaseExpiresAt = null;
    this._leaseToken = null;
    this._leaseOwnerInstanceId = null;
    this._updatedAt = now;
  }

  public cancel(): void {
    const now = new Date();
    this._status = GenerationStatus.CANCELLED;
    this._leaseExpiresAt = null;
    this._leaseToken = null;
    this._leaseOwnerInstanceId = null;
    this._updatedAt = now;
  }

  public interrupt(partialContent?: string): void {
    const now = new Date();
    this._status = GenerationStatus.INTERRUPTED;
    if (partialContent !== undefined) {
      this._content = partialContent;
    }
    this._leaseExpiresAt = null;
    this._leaseToken = null;
    this._leaseOwnerInstanceId = null;
    this._updatedAt = now;
  }

  public setCanonical(isCanonical: boolean): void {
    if (isCanonical) {
      if (this._role !== ConversationRole.ASSISTANT) {
        throw new InvalidCanonicalDesignationException(
          'Only ASSISTANT messages can be designated as canonical.',
        );
      }
      if (this._status !== GenerationStatus.SUCCESS) {
        throw new InvalidCanonicalDesignationException(
          `Canonical ASSISTANT message must have status SUCCESS, got '${this._status}'.`,
        );
      }
    }
    this._isCanonical = isCanonical;
    this._updatedAt = new Date();
  }

  public acquireLease(ownerInstanceId: string, leaseToken: string, expiresAt: Date): void {
    if (this.isTerminal()) {
      throw new InvalidLifecycleTransitionException(
        `Terminal generation attempt '${this._id.value}' in status '${this._status}' cannot acquire an active lease.`,
      );
    }
    this._leaseOwnerInstanceId = ownerInstanceId;
    this._leaseToken = leaseToken;
    this._leaseExpiresAt = expiresAt;
    this._updatedAt = new Date();
  }

  public releaseLease(): void {
    this._leaseOwnerInstanceId = null;
    this._leaseToken = null;
    this._leaseExpiresAt = null;
    this._updatedAt = new Date();
  }
}
