import { ConversationId } from '../value-objects/conversation-id.vo';
import { InvalidConversationTurnException } from '../exceptions/conversation.exceptions';

export interface CreateAiConversationAuditLogProps {
  id?: string;
  tenantId: string;
  conversationId: ConversationId | string;
  conversationTitleSnapshot: string;
  conversationOwnerUserId: string;
  inspectorUserId: string;
  inspectorRole: string;
  action?: string;
  reason: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt?: Date;
}

export interface ReconstituteAiConversationAuditLogProps {
  id: string;
  tenantId: string;
  conversationId: ConversationId | string;
  conversationTitleSnapshot: string;
  conversationOwnerUserId: string;
  inspectorUserId: string;
  inspectorRole: string;
  action: string;
  reason: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

/**
 * Domain entity representing an immutable audit log entry for cross-user or clinical
 * inspection of persistent conversation histories.
 *
 * Invariants:
 * - Immutable once created (Object.freeze).
 * - Enforces required fields: tenantId, conversationId, conversationOwnerUserId, inspectorUserId, inspectorRole, reason.
 */
export class AiConversationAuditLog {
  public static readonly DEFAULT_ACTION = 'CLINICAL_CONVERSATION_INSPECTED';

  private readonly _id: string;
  private readonly _tenantId: string;
  private readonly _conversationId: ConversationId;
  private readonly _conversationTitleSnapshot: string;
  private readonly _conversationOwnerUserId: string;
  private readonly _inspectorUserId: string;
  private readonly _inspectorRole: string;
  private readonly _action: string;
  private readonly _reason: string;
  private readonly _ipAddress: string | null;
  private readonly _userAgent: string | null;
  private readonly _createdAt: Date;

  private constructor(props: ReconstituteAiConversationAuditLogProps) {
    if (
      !props.tenantId ||
      typeof props.tenantId !== 'string' ||
      props.tenantId.trim().length === 0
    ) {
      throw new InvalidConversationTurnException('Audit log tenantId cannot be empty.');
    }
    if (
      !props.inspectorUserId ||
      typeof props.inspectorUserId !== 'string' ||
      props.inspectorUserId.trim().length === 0
    ) {
      throw new InvalidConversationTurnException('Audit log inspectorUserId cannot be empty.');
    }
    if (
      !props.inspectorRole ||
      typeof props.inspectorRole !== 'string' ||
      props.inspectorRole.trim().length === 0
    ) {
      throw new InvalidConversationTurnException('Audit log inspectorRole cannot be empty.');
    }
    if (
      !props.conversationOwnerUserId ||
      typeof props.conversationOwnerUserId !== 'string' ||
      props.conversationOwnerUserId.trim().length === 0
    ) {
      throw new InvalidConversationTurnException(
        'Audit log conversationOwnerUserId cannot be empty.',
      );
    }
    if (!props.reason || typeof props.reason !== 'string' || props.reason.trim().length === 0) {
      throw new InvalidConversationTurnException('Audit log reason cannot be empty.');
    }

    this._id = props.id;
    this._tenantId = props.tenantId.trim();
    this._conversationId =
      props.conversationId instanceof ConversationId
        ? props.conversationId
        : ConversationId.create(props.conversationId);
    this._conversationTitleSnapshot = props.conversationTitleSnapshot;
    this._conversationOwnerUserId = props.conversationOwnerUserId.trim();
    this._inspectorUserId = props.inspectorUserId.trim();
    this._inspectorRole = props.inspectorRole.trim();
    this._action = props.action;
    this._reason = props.reason.trim();
    this._ipAddress = props.ipAddress ?? null;
    this._userAgent = props.userAgent ?? null;
    this._createdAt = props.createdAt;

    Object.freeze(this);
  }

  public static create(props: CreateAiConversationAuditLogProps): AiConversationAuditLog {
    const id =
      props.id ??
      (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID
        ? globalThis.crypto.randomUUID()
        : `audit_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`);
    return new AiConversationAuditLog({
      id,
      tenantId: props.tenantId,
      conversationId: props.conversationId,
      conversationTitleSnapshot: props.conversationTitleSnapshot,
      conversationOwnerUserId: props.conversationOwnerUserId,
      inspectorUserId: props.inspectorUserId,
      inspectorRole: props.inspectorRole,
      action: props.action ?? AiConversationAuditLog.DEFAULT_ACTION,
      reason: props.reason,
      ipAddress: props.ipAddress ?? null,
      userAgent: props.userAgent ?? null,
      createdAt: props.createdAt ?? new Date(),
    });
  }

  public static reconstitute(
    props: ReconstituteAiConversationAuditLogProps,
  ): AiConversationAuditLog {
    return new AiConversationAuditLog(props);
  }

  public get id(): string {
    return this._id;
  }

  public get tenantId(): string {
    return this._tenantId;
  }

  public get conversationId(): ConversationId {
    return this._conversationId;
  }

  public get conversationTitleSnapshot(): string {
    return this._conversationTitleSnapshot;
  }

  public get conversationOwnerUserId(): string {
    return this._conversationOwnerUserId;
  }

  public get inspectorUserId(): string {
    return this._inspectorUserId;
  }

  public get inspectorRole(): string {
    return this._inspectorRole;
  }

  public get action(): string {
    return this._action;
  }

  public get reason(): string {
    return this._reason;
  }

  public get ipAddress(): string | null {
    return this._ipAddress;
  }

  public get userAgent(): string | null {
    return this._userAgent;
  }

  public get createdAt(): Date {
    return this._createdAt;
  }
}
