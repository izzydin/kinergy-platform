import { ChatMessage } from '../value-objects/chat-message.vo';
import { InvalidConversationTurnException } from '../exceptions/conversation.exceptions';

export interface CreateConversationSessionProps {
  id: string;
  tenantId: string;
  userId: string;
  messages?: ChatMessage[];
  createdAt?: Date;
  updatedAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface BoundedHistorySelectionOptions {
  maxTurns?: number;
  maxTokens?: number;
  tokenCounter?: (text: string) => number;
}

/**
 * Domain entity representing an isolated, multi-turn conversational session
 * within an authenticated tenant boundary.
 *
 * Invariants:
 * - Strictly partitioned by tenantId and owned by userId.
 * - History turns are strictly alternating (user -> assistant) or user turns.
 * - Previous assistant answers are treated as non-authoritative historical context.
 * - Enforces bounded history size (default: 10 prior turns, 500 tokens).
 * - Sanitizes prompt-injection markup from message content.
 */
export class ConversationSession {
  public static readonly DEFAULT_MAX_TURNS = 10;
  public static readonly DEFAULT_MAX_TOKENS = 500;
  public static readonly MAX_STORED_MESSAGES = 60; // 30 complete turns

  public readonly id: string;
  public readonly tenantId: string;
  public readonly userId: string;
  private _messages: ChatMessage[];
  public readonly createdAt: Date;
  private _updatedAt: Date;
  public readonly metadata: Readonly<Record<string, unknown>>;

  private constructor(props: CreateConversationSessionProps) {
    if (!props.id || typeof props.id !== 'string' || props.id.trim().length === 0) {
      throw new InvalidConversationTurnException(
        'Conversation session ID must be a non-empty string.',
      );
    }
    if (
      !props.tenantId ||
      typeof props.tenantId !== 'string' ||
      props.tenantId.trim().length === 0
    ) {
      throw new InvalidConversationTurnException(
        'Conversation session tenantId must be a non-empty string.',
      );
    }
    if (!props.userId || typeof props.userId !== 'string' || props.userId.trim().length === 0) {
      throw new InvalidConversationTurnException(
        'Conversation session userId must be a non-empty string.',
      );
    }

    this.id = props.id.trim();
    this.tenantId = props.tenantId.trim();
    this.userId = props.userId.trim();
    this._messages = props.messages ? [...props.messages] : [];
    this.createdAt = props.createdAt ?? new Date();
    this._updatedAt = props.updatedAt ?? new Date();
    this.metadata = props.metadata ? { ...props.metadata } : {};
  }

  public static create(props: CreateConversationSessionProps): ConversationSession {
    return new ConversationSession(props);
  }

  public get messages(): readonly ChatMessage[] {
    return this._messages;
  }

  public get updatedAt(): Date {
    return this._updatedAt;
  }

  /**
   * Appends an alternating turn (user question + generated assistant answer).
   * Strips harmful injection delimiters and limits total stored messages.
   */
  public addTurn(userText: string, assistantText: string): void {
    if (!userText || typeof userText !== 'string' || userText.trim().length === 0) {
      throw new InvalidConversationTurnException(
        'User message in conversation turn cannot be empty.',
      );
    }
    if (!assistantText || typeof assistantText !== 'string' || assistantText.trim().length === 0) {
      throw new InvalidConversationTurnException(
        'Assistant message in conversation turn cannot be empty.',
      );
    }

    const sanitizedUser = this.sanitizeMessageText(userText);
    const sanitizedAssistant = this.sanitizeMessageText(assistantText);

    const userMsg = ChatMessage.user(sanitizedUser);
    const assistantMsg = ChatMessage.assistant(sanitizedAssistant);

    this._messages.push(userMsg, assistantMsg);

    // Bound total messages in storage
    if (this._messages.length > ConversationSession.MAX_STORED_MESSAGES) {
      this._messages = this._messages.slice(
        this._messages.length - ConversationSession.MAX_STORED_MESSAGES,
      );
    }

    this._updatedAt = new Date();
  }

  /**
   * Selects a bounded slice of recent history respecting maximum turn count
   * and token budget, traversing backwards from the most recent turn.
   */
  public selectBoundedHistory(options?: BoundedHistorySelectionOptions): ChatMessage[] {
    const maxTurns = options?.maxTurns ?? ConversationSession.DEFAULT_MAX_TURNS;
    const maxTokens = options?.maxTokens ?? ConversationSession.DEFAULT_MAX_TOKENS;
    const tokenCounter =
      options?.tokenCounter ??
      ((text: string) => {
        const words = text.trim().split(/\s+/).length;
        return Math.ceil(words * 1.4) + Math.ceil(text.length / 50);
      });

    if (this._messages.length === 0 || maxTurns <= 0 || maxTokens <= 0) {
      return [];
    }

    // Limit by turn count: 1 turn = 1 user message + 1 assistant message (up to maxTurns * 2 messages)
    const maxMessages = maxTurns * 2;
    const candidateMessages = this._messages.slice(-maxMessages);

    const included: ChatMessage[] = [];
    let currentTokens = 0;

    // Traverse backwards from most recent message
    for (let i = candidateMessages.length - 1; i >= 0; i--) {
      const msg = candidateMessages[i];
      if (!msg) continue;
      const msgTokens = tokenCounter(`${msg.role}: ${msg.content}\n`);

      if (currentTokens + msgTokens <= maxTokens) {
        included.unshift(msg);
        currentTokens += msgTokens;
      } else {
        break;
      }
    }

    return included;
  }

  /**
   * Enforces tenant isolation and user ownership verification.
   * Cross-tenant access is strictly denied.
   * Non-owners are denied unless possessing supervisor/admin role.
   */
  public isAuthorized(tenantId: string, userId: string, roles: readonly string[]): boolean {
    if (!tenantId || this.tenantId !== tenantId) {
      return false;
    }

    if (this.userId === userId) {
      return true;
    }

    // Elevated management roles allowed to inspect audit histories within the same tenant
    const privilegedRoles = ['ROLE_ADMIN', 'TENANT_ADMIN', 'CLINICAL_SUPERVISOR'];
    return roles.some((role) => privilegedRoles.includes(role));
  }

  /**
   * Neutralizes prompt injection breakout sequences inside conversation messages.
   */
  private sanitizeMessageText(text: string): string {
    return text
      .replace(/<system>/gi, '&lt;system&gt;')
      .replace(/<\/system>/gi, '&lt;/system&gt;')
      .replace(/<retrieved_evidence>/gi, '&lt;retrieved_evidence&gt;')
      .replace(/<\/retrieved_evidence>/gi, '&lt;/retrieved_evidence&gt;')
      .replace(/<evidence_chunk/gi, '&lt;evidence_chunk')
      .replace(/<\/evidence_chunk>/gi, '&lt;/evidence_chunk&gt;');
  }
}
