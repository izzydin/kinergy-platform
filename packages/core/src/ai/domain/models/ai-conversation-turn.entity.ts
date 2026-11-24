import { TurnId } from '../value-objects/turn-id.vo';
import { ConversationId } from '../value-objects/conversation-id.vo';
import { ClientTurnId } from '../value-objects/client-turn-id.vo';
import { MessageId } from '../value-objects/message-id.vo';
import { TurnStatus } from '../enums/turn-status.enum';
import { ConversationRole } from '../enums/conversation-role.enum';
import {
  InvalidConversationTurnException,
  InvalidLifecycleTransitionException,
  InvalidMessageOwnershipException,
} from '../exceptions/conversation.exceptions';

export interface CreateAiConversationTurnProps {
  id?: TurnId | string;
  conversationId: ConversationId | string;
  tenantId: string;
  turnIndex: number;
  status?: TurnStatus;
  clientTurnId: ClientTurnId | string;
  idempotencyKey: string;
  idempotencyPayloadHash: string;
  activeAttemptId?: MessageId | string | null;
  activeAttemptNumber?: number;
  createdAt?: Date;
  completedAt?: Date | null;
  updatedAt?: Date;
}

export interface ReconstituteAiConversationTurnProps {
  id: TurnId | string;
  conversationId: ConversationId | string;
  tenantId: string;
  turnIndex: number;
  status: TurnStatus;
  clientTurnId: ClientTurnId | string;
  idempotencyKey: string;
  idempotencyPayloadHash: string;
  activeAttemptId: MessageId | string | null;
  activeAttemptNumber: number;
  createdAt: Date;
  completedAt: Date | null;
  updatedAt: Date;
}

/**
 * Domain entity representing a conversation turn (a client request and its assistant generation attempts).
 */
export class AiConversationTurn {
  private readonly _id: TurnId;
  private readonly _conversationId: ConversationId;
  private readonly _tenantId: string;
  private readonly _turnIndex: number;
  private _status: TurnStatus;
  private readonly _clientTurnId: ClientTurnId;
  private readonly _idempotencyKey: string;
  private readonly _idempotencyPayloadHash: string;
  private _activeAttemptId: MessageId | null;
  private _activeAttemptNumber: number;
  private readonly _createdAt: Date;
  private _completedAt: Date | null;
  private _updatedAt: Date;

  private constructor(props: ReconstituteAiConversationTurnProps) {
    if (
      !props.tenantId ||
      typeof props.tenantId !== 'string' ||
      props.tenantId.trim().length === 0
    ) {
      throw new InvalidConversationTurnException('Turn tenantId cannot be empty.');
    }
    if (
      typeof props.turnIndex !== 'number' ||
      !Number.isInteger(props.turnIndex) ||
      props.turnIndex < 1
    ) {
      throw new InvalidConversationTurnException(
        `Turn turnIndex must be a positive integer >= 1, received: ${props.turnIndex}`,
      );
    }
    if (
      !props.idempotencyKey ||
      typeof props.idempotencyKey !== 'string' ||
      props.idempotencyKey.trim().length === 0
    ) {
      throw new InvalidConversationTurnException('Turn idempotencyKey cannot be empty.');
    }
    if (
      !props.idempotencyPayloadHash ||
      typeof props.idempotencyPayloadHash !== 'string' ||
      props.idempotencyPayloadHash.trim().length === 0
    ) {
      throw new InvalidConversationTurnException('Turn idempotencyPayloadHash cannot be empty.');
    }

    this._id = props.id instanceof TurnId ? props.id : TurnId.create(props.id);
    this._conversationId =
      props.conversationId instanceof ConversationId
        ? props.conversationId
        : ConversationId.create(props.conversationId);
    this._tenantId = props.tenantId.trim();
    this._turnIndex = props.turnIndex;
    this._status = props.status;
    this._clientTurnId =
      props.clientTurnId instanceof ClientTurnId
        ? props.clientTurnId
        : ClientTurnId.create(props.clientTurnId);
    this._idempotencyKey = props.idempotencyKey.trim();
    this._idempotencyPayloadHash = props.idempotencyPayloadHash.trim();
    this._activeAttemptId = props.activeAttemptId
      ? props.activeAttemptId instanceof MessageId
        ? props.activeAttemptId
        : MessageId.create(props.activeAttemptId)
      : null;
    this._activeAttemptNumber = props.activeAttemptNumber >= 1 ? props.activeAttemptNumber : 1;
    this._createdAt = props.createdAt;
    this._completedAt = props.completedAt;
    this._updatedAt = props.updatedAt;
  }

  public static create(props: CreateAiConversationTurnProps): AiConversationTurn {
    const now = new Date();
    return new AiConversationTurn({
      id: props.id instanceof TurnId ? props.id : TurnId.create(props.id),
      conversationId: props.conversationId,
      tenantId: props.tenantId,
      turnIndex: props.turnIndex,
      status: props.status ?? TurnStatus.PENDING,
      clientTurnId: props.clientTurnId,
      idempotencyKey: props.idempotencyKey,
      idempotencyPayloadHash: props.idempotencyPayloadHash,
      activeAttemptId: props.activeAttemptId ?? null,
      activeAttemptNumber: props.activeAttemptNumber ?? 1,
      createdAt: props.createdAt ?? now,
      completedAt: props.completedAt ?? null,
      updatedAt: props.updatedAt ?? now,
    });
  }

  public static reconstitute(props: ReconstituteAiConversationTurnProps): AiConversationTurn {
    return new AiConversationTurn(props);
  }

  public get id(): TurnId {
    return this._id;
  }

  public get conversationId(): ConversationId {
    return this._conversationId;
  }

  public get tenantId(): string {
    return this._tenantId;
  }

  public get turnIndex(): number {
    return this._turnIndex;
  }

  public get status(): TurnStatus {
    return this._status;
  }

  public get clientTurnId(): ClientTurnId {
    return this._clientTurnId;
  }

  public get idempotencyKey(): string {
    return this._idempotencyKey;
  }

  public get idempotencyPayloadHash(): string {
    return this._idempotencyPayloadHash;
  }

  public get activeAttemptId(): MessageId | null {
    return this._activeAttemptId;
  }

  public get activeAttemptNumber(): number {
    return this._activeAttemptNumber;
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
      this._status === TurnStatus.COMPLETED ||
      this._status === TurnStatus.FAILED ||
      this._status === TurnStatus.CANCELLED ||
      this._status === TurnStatus.INTERRUPTED
    );
  }

  public markStreaming(activeAttemptId: MessageId | string): void {
    if (this.isTerminal()) {
      throw new InvalidLifecycleTransitionException(
        `Cannot transition turn '${this._id.value}' from terminal status '${this._status}' to 'STREAMING'.`,
      );
    }
    this._status = TurnStatus.STREAMING;
    this._activeAttemptId =
      activeAttemptId instanceof MessageId ? activeAttemptId : MessageId.create(activeAttemptId);
    this._updatedAt = new Date();
  }

  public markCompleted(at?: Date): void {
    const timestamp = at ?? new Date();
    this._status = TurnStatus.COMPLETED;
    this._completedAt = timestamp;
    this._updatedAt = timestamp;
  }

  public markFailed(): void {
    this._status = TurnStatus.FAILED;
    this._updatedAt = new Date();
  }

  public markCancelled(): void {
    this._status = TurnStatus.CANCELLED;
    this._updatedAt = new Date();
  }

  public markInterrupted(): void {
    this._status = TurnStatus.INTERRUPTED;
    this._updatedAt = new Date();
  }

  public setActiveAttempt(attemptId: MessageId | string, attemptNumber: number): void {
    this._activeAttemptId =
      attemptId instanceof MessageId ? attemptId : MessageId.create(attemptId);
    this._activeAttemptNumber = Math.max(1, attemptNumber);
    this._updatedAt = new Date();
  }

  /**
   * Associates and validates an active assistant generation attempt with this turn,
   * enforcing that it belongs to the exact same turn, conversation, tenant, and role.
   */
  public associateActiveAttempt(attempt: {
    id: MessageId | string;
    turnId: TurnId | string;
    conversationId: ConversationId | string;
    tenantId: string;
    role: ConversationRole;
    attemptNumber: number;
  }): void {
    const turnIdStr = attempt.turnId instanceof TurnId ? attempt.turnId.value : attempt.turnId;
    const convIdStr =
      attempt.conversationId instanceof ConversationId
        ? attempt.conversationId.value
        : attempt.conversationId;

    if (turnIdStr !== this._id.value) {
      throw new InvalidMessageOwnershipException(
        `Active attempt must belong to turn '${this._id.value}', received '${turnIdStr}'.`,
      );
    }
    if (convIdStr !== this._conversationId.value) {
      throw new InvalidMessageOwnershipException(
        `Active attempt must belong to conversation '${this._conversationId.value}', received '${convIdStr}'.`,
      );
    }
    if (attempt.tenantId !== this._tenantId) {
      throw new InvalidMessageOwnershipException(
        `Active attempt must belong to tenant '${this._tenantId}', received '${attempt.tenantId}'.`,
      );
    }
    if (attempt.role !== ConversationRole.ASSISTANT) {
      throw new InvalidMessageOwnershipException(
        `Active attempt must have role 'ASSISTANT', received '${attempt.role}'.`,
      );
    }

    this.setActiveAttempt(attempt.id, attempt.attemptNumber);
  }
}
