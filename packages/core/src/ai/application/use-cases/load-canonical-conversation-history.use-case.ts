import { IAiConversationRepositoryPort } from '../../ports/outbound/ai-conversation-repository.port';
import { IAiConversationTurnRepositoryPort } from '../../ports/outbound/ai-conversation-turn-repository.port';
import { IAiConversationMessageRepositoryPort } from '../../ports/outbound/ai-conversation-message-repository.port';
import { AiConversationMessage } from '../../domain/models/ai-conversation-message.entity';
import { ConversationRole } from '../../domain/enums/conversation-role.enum';
import { TurnStatus } from '../../domain/enums/turn-status.enum';
import { GenerationStatus } from '../../domain/enums/generation-status.enum';
import { ChatMessage } from '../../domain/value-objects/chat-message.vo';
import { CanonicalChatMessageMapper } from '../mappers/canonical-chat-message.mapper';
import {
  ConversationNotFoundError,
  TurnNotFoundError,
  InvalidTurnInputError,
  InvalidConversationLifecycleError,
} from '../errors/ai-conversation-application.error';

export interface LoadCanonicalConversationHistoryInput {
  readonly tenantId: string;
  readonly conversationId: string;
  readonly turnId: string;
  readonly maxCompletedTurns?: number; // Defaults to 10
}

export interface CanonicalConversationHistoryResult {
  readonly conversationId: string;
  readonly currentTurnId: string;
  readonly currentTurnIndex: number;
  readonly currentUserMessage: AiConversationMessage;
  readonly currentAssistantAttempt: AiConversationMessage;
  readonly priorCanonicalMessages: readonly ChatMessage[];
  readonly completedTurnsCount: number;
  readonly totalCompletedTurnsInHistory: number;
  readonly isContextTruncated: boolean;
}

/**
 * Use case to load and assemble canonical conversation history for RAG context construction.
 *
 * Guarantees (BE.06.02):
 * 1. AI-09.3 is the sole source of truth for conversation history.
 * 2. Enforces tenant and conversation ownership boundaries before providing history.
 * 3. Follows the approved context-window policy: up to 10 completed canonical turns.
 * 4. Preserves chronological message ordering using immutable sequence numbers.
 * 5. Excludes the current assistant placeholder from conversational history.
 * 6. Guarantees the current user message is isolated and returned for singular inclusion as the query.
 * 7. Excludes non-terminal, cancelled, and failed turns from completed context.
 * 8. Never exposes internal database entities or raw transaction primitives to the RAG pipeline.
 */
export class LoadCanonicalConversationHistoryUseCase {
  public static readonly DEFAULT_MAX_COMPLETED_TURNS = 10;

  constructor(
    private readonly convRepo: IAiConversationRepositoryPort,
    private readonly turnRepo: IAiConversationTurnRepositoryPort,
    private readonly messageRepo: IAiConversationMessageRepositoryPort,
  ) {}

  public async execute(
    input: LoadCanonicalConversationHistoryInput,
  ): Promise<CanonicalConversationHistoryResult> {
    // 1. Validate Input
    if (!input) {
      throw new InvalidTurnInputError('input', 'Input cannot be null or undefined.');
    }

    const tenantId = input.tenantId?.trim();
    if (!tenantId) {
      throw new InvalidTurnInputError('tenantId', 'Tenant ID is required.');
    }

    const conversationId = input.conversationId?.trim();
    if (!conversationId) {
      throw new InvalidTurnInputError('conversationId', 'Conversation ID is required.');
    }

    const turnId = input.turnId?.trim();
    if (!turnId) {
      throw new InvalidTurnInputError('turnId', 'Turn ID is required.');
    }

    const maxCompletedTurns =
      typeof input.maxCompletedTurns === 'number' && input.maxCompletedTurns > 0
        ? input.maxCompletedTurns
        : LoadCanonicalConversationHistoryUseCase.DEFAULT_MAX_COMPLETED_TURNS;

    // 2. Validate Conversation Existence and Tenant Boundary
    const conversation = await this.convRepo.findById(tenantId, conversationId);
    if (!conversation) {
      // Prevents cross-tenant existence leaks: returns 404/NotFoundError for both missing and foreign tenant conversations
      throw new ConversationNotFoundError(conversationId, tenantId);
    }

    if (conversation.isArchived()) {
      throw new InvalidConversationLifecycleError(
        conversationId,
        'Cannot execute turn on an archived conversation.',
      );
    }

    // 3. Validate Turn Existence and Association
    const currentTurn = await this.turnRepo.findById(tenantId, conversationId, turnId);
    if (!currentTurn) {
      throw new TurnNotFoundError(turnId, conversationId, tenantId);
    }

    if (currentTurn.conversationId.value !== conversationId) {
      throw new TurnNotFoundError(turnId, conversationId, tenantId);
    }

    if (currentTurn.isTerminal()) {
      throw new InvalidConversationLifecycleError(
        conversationId,
        `Turn '${turnId}' is already in terminal status '${currentTurn.status}'.`,
      );
    }

    if (!currentTurn.activeAttemptId) {
      throw new InvalidConversationLifecycleError(
        conversationId,
        `Turn '${turnId}' does not have an active assistant generation attempt.`,
      );
    }

    // 4. Retrieve Current Turn Messages
    const currentTurnMessages = await this.messageRepo.listByTurn(tenantId, conversationId, turnId);
    const currentUserMessage = currentTurnMessages.find((m) => m.role === ConversationRole.USER);
    if (!currentUserMessage) {
      throw new InvalidConversationLifecycleError(
        conversationId,
        `Turn '${turnId}' lacks a user prompt message.`,
      );
    }

    const currentAssistantAttempt = currentTurnMessages.find(
      (m) =>
        m.id.value === currentTurn.activeAttemptId!.value && m.role === ConversationRole.ASSISTANT,
    );
    if (!currentAssistantAttempt) {
      throw new InvalidConversationLifecycleError(
        conversationId,
        `Assistant placeholder '${currentTurn.activeAttemptId.value}' not found for turn '${turnId}'.`,
      );
    }

    // 5. Query Completed Turns Preceding the Current Turn (Excluding non-terminal, cancelled, and failed turns)
    const precedingCompletedTurns = await this.turnRepo.listByConversation(
      tenantId,
      conversationId,
      {
        status: TurnStatus.COMPLETED,
        toTurnIndex: currentTurn.turnIndex - 1,
      },
    );

    // Filter strictly to ensure integrity
    const validCompletedTurns = precedingCompletedTurns
      .filter((t) => t.turnIndex < currentTurn.turnIndex && t.status === TurnStatus.COMPLETED)
      .sort((a, b) => a.turnIndex - b.turnIndex);

    const totalCompletedTurnsInHistory = validCompletedTurns.length;
    const isContextTruncated = totalCompletedTurnsInHistory > maxCompletedTurns;

    // Apply context-window policy: up to 10 completed canonical turns
    const windowedTurns = isContextTruncated
      ? validCompletedTurns.slice(-maxCompletedTurns)
      : validCompletedTurns;

    // 6. Load Canonical Messages for Windowed Completed Turns
    const rawPriorMessages: AiConversationMessage[] = [];

    for (const turn of windowedTurns) {
      const messages = await this.messageRepo.listByTurn(tenantId, conversationId, turn.id);
      // For each completed turn, select the user prompt and canonical assistant response
      const turnUserMsg = messages.find((m) => m.role === ConversationRole.USER);
      const turnAssistantMsg = messages.find(
        (m) =>
          m.role === ConversationRole.ASSISTANT &&
          m.isCanonical === true &&
          m.status === GenerationStatus.SUCCESS,
      );

      if (turnUserMsg) {
        rawPriorMessages.push(turnUserMsg);
      }
      if (turnAssistantMsg) {
        rawPriorMessages.push(turnAssistantMsg);
      }
    }

    // 7. Order Prior Messages strictly by immutable sequence numbers (sequenceNumber ASC, id ASC)
    rawPriorMessages.sort((a, b) => {
      if (a.sequenceNumber !== b.sequenceNumber) {
        return a.sequenceNumber - b.sequenceNumber;
      }
      return a.id.value.localeCompare(b.id.value);
    });

    // 8. Map to AI-08 Context ChatMessage value objects defensively
    const priorCanonicalMessages: ChatMessage[] = [];
    for (const msg of rawPriorMessages) {
      // Defensive guard: Ensure current turn's messages are never accidentally present in prior history
      if (msg.turnId.value === turnId || msg.id.value === currentUserMessage.id.value) {
        continue;
      }
      const chatMsg = CanonicalChatMessageMapper.toChatMessageOrNull(msg);
      if (chatMsg) {
        priorCanonicalMessages.push(chatMsg);
      }
    }

    return {
      conversationId,
      currentTurnId: turnId,
      currentTurnIndex: currentTurn.turnIndex,
      currentUserMessage,
      currentAssistantAttempt,
      priorCanonicalMessages,
      completedTurnsCount: windowedTurns.length,
      totalCompletedTurnsInHistory,
      isContextTruncated,
    };
  }
}
