import { Injectable, Inject, Optional, Logger } from '@nestjs/common';
import {
  IConversationHistoryManagerPort,
  ResolveHistoryCommand,
  ResolvedHistoryResult,
  RecordTurnCommand,
  IConversationRepositoryPort,
  CONVERSATION_REPOSITORY_PORT,
  ConversationSession,
  ChatMessage,
  UnauthorizedConversationAccessException,
  ConversationNotFoundException,
  UnauthorizedRetrievalException,
} from '@kinergy-platform/core';
import { AiConfiguration, DEFAULT_AI_CONFIG } from '../../config/ai.config';
import { AI_CONFIG_TOKEN } from '../../ai.tokens';
import { InMemoryConversationRepositoryAdapter } from '../../adapters/conversation/in-memory-conversation-repository.adapter';

/**
 * Production implementation of IConversationHistoryManagerPort.
 *
 * Responsibilities:
 * 1. Multi-turn conversation resolution with strict tenant isolation and RBAC.
 * 2. Bounded history selection respecting turn counts and token allocations.
 * 3. Prevention of prompt spoofing by stripping client-supplied 'system' roles.
 * 4. Sanitization of injection breakout markup in previous turns.
 * 5. Contextual follow-up identification without violating the no-generative-query-rewriting rule.
 * 6. Treating conversational history strictly as non-authoritative context.
 */
@Injectable()
export class ConversationHistoryManagerService implements IConversationHistoryManagerPort {
  private readonly logger = new Logger(ConversationHistoryManagerService.name);
  private readonly repository: IConversationRepositoryPort;
  private readonly config: AiConfiguration;

  // Patterns indicating contextual follow-ups that rely on conversational anaphora
  private static readonly FOLLOW_UP_PATTERNS = [
    /\b(?:cu[aá]nto|cu[aá]ndo|c[oó]mo|d[oó]nde|por qu[eé])\s+(?:tiempo|dura|cuesta|se|debe|puede|aplica|tarda|funciona|hacerlo|iniciar|tomar)\b/i,
    /\b(?:y|pero|adem[aá]s)\s+(?:qu[eé]|cu[aá]l|c[oó]mo)\b/i,
    /\b(?:de\s+eso|de\s+este|de\s+esta|del\s+mismo|de\s+la\s+misma|con\s+eso|con\s+ello)\b/i,
    /\b(?:how\s+long|how\s+much|what\s+about|does\s+it|can\s+it|is\s+it|and\s+then)\b/i,
    /^(?:y|and|how|why|when)\b/i,
  ];

  constructor(
    @Optional()
    @Inject(CONVERSATION_REPOSITORY_PORT)
    repository?: IConversationRepositoryPort,
    @Optional()
    @Inject(AI_CONFIG_TOKEN)
    config?: AiConfiguration,
  ) {
    this.config = { ...DEFAULT_AI_CONFIG, ...config };
    this.repository =
      repository ||
      new InMemoryConversationRepositoryAdapter(this.config.conversationTtlHours ?? 24);
  }

  public async resolveHistory(command: ResolveHistoryCommand): Promise<ResolvedHistoryResult> {
    const { authContext, query, conversationId, clientHistory } = command;

    if (!authContext || !authContext.tenantId || authContext.tenantId.trim().length === 0) {
      throw new UnauthorizedRetrievalException('Tenant identification is required.');
    }

    const maxTurns = command.maxTurns ?? this.config.chatMaxHistoryTurns ?? 10;
    const maxTokens = command.maxTokens ?? this.config.chatMaxHistoryTokens ?? 500;

    let session: ConversationSession | undefined;
    let rawMessages: ChatMessage[] = [];

    // 1. Resolve from persistent/in-memory session repository if conversationId is provided
    if (conversationId && conversationId.trim().length > 0) {
      const trimmedId = conversationId.trim();
      const found = await this.repository.findById(trimmedId, authContext.tenantId);

      if (!found) {
        throw new ConversationNotFoundException(trimmedId, authContext.tenantId);
      }

      // Enforce tenant and user authorization boundary
      if (!found.isAuthorized(authContext.tenantId, authContext.userId, authContext.roles)) {
        this.logger.warn(
          `Unauthorized conversation access attempt: user '${authContext.userId}' in tenant '${authContext.tenantId}' tried accessing conversation '${trimmedId}' owned by '${found.userId}'.`,
        );
        throw new UnauthorizedConversationAccessException(
          `User '${authContext.userId}' is not authorized to access conversation '${trimmedId}'.`,
        );
      }

      session = found;
      rawMessages = found.selectBoundedHistory({
        maxTurns,
        maxTokens,
        tokenCounter: (text: string) => this.countTokens(text),
      });
    } else if (clientHistory && clientHistory.length > 0) {
      // 2. Resolve and sanitize client-supplied conversation history
      rawMessages = this.sanitizeAndBoundClientHistory(clientHistory, maxTurns, maxTokens);
    }

    const historyTokens = rawMessages.reduce(
      (acc, msg) => acc + this.countTokens(`${msg.role}: ${msg.content}\n`),
      0,
    );

    // 3. Follow-up query detection (for telemetry & prompting; retrieval query remains unmodified)
    const isFollowUp = rawMessages.length > 0 && this.detectFollowUp(query);

    return {
      session,
      boundedHistory: rawMessages,
      historyTokens,
      turnCount: Math.ceil(rawMessages.length / 2),
      isFollowUp,
    };
  }

  public async recordTurn(command: RecordTurnCommand): Promise<void> {
    const { tenantId, conversationId, query, answer } = command;
    if (!conversationId || !tenantId) return;

    const session = await this.repository.findById(conversationId, tenantId);
    if (!session) {
      return;
    }

    session.addTurn(query, answer);
    await this.repository.save(session);
  }

  /**
   * Cleans, sanitizes, and bounds client-provided messages:
   * - Strips forbidden 'system' roles to prevent prompt spoofing.
   * - Strips markup injection tags.
   * - Traverses backwards to bound turns and token budget.
   */
  private sanitizeAndBoundClientHistory(
    history: readonly ChatMessage[],
    maxTurns: number,
    maxTokens: number,
  ): ChatMessage[] {
    const sanitized: ChatMessage[] = [];

    // Filter and sanitize
    for (const msg of history) {
      if (!msg) continue;

      // Disallow client-injected system instructions
      if (msg.role === 'system') {
        this.logger.warn(
          `Stripped client-injected system role message from conversation history: "${msg.content.slice(0, 50)}..."`,
        );
        continue;
      }

      if (msg.role !== 'user' && msg.role !== 'assistant') {
        continue;
      }

      if (!msg.content || msg.content.trim().length === 0) {
        continue;
      }

      const cleanContent = this.sanitizePromptInjectionTags(msg.content.trim());
      sanitized.push(
        msg.role === 'user' ? ChatMessage.user(cleanContent) : ChatMessage.assistant(cleanContent),
      );
    }

    // Bound by turns (maxTurns * 2 messages)
    const turnBounded = sanitized.slice(-(maxTurns * 2));

    // Bound by token budget traversing backwards
    const tokenBounded: ChatMessage[] = [];
    let currentTokens = 0;

    for (let i = turnBounded.length - 1; i >= 0; i--) {
      const msg = turnBounded[i];
      if (!msg) continue;
      const tokens = this.countTokens(`${msg.role}: ${msg.content}\n`);

      if (currentTokens + tokens <= maxTokens) {
        tokenBounded.unshift(msg);
        currentTokens += tokens;
      } else {
        break;
      }
    }

    return tokenBounded;
  }

  private detectFollowUp(query: string): boolean {
    if (!query || query.trim().length === 0) return false;
    const trimmed = query.trim();
    return ConversationHistoryManagerService.FOLLOW_UP_PATTERNS.some((pattern) =>
      pattern.test(trimmed),
    );
  }

  private sanitizePromptInjectionTags(content: string): string {
    if (!content) return '';
    return content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private countTokens(text: string): number {
    if (!text || text.length === 0) return 0;
    const words = text.trim().split(/\s+/).length;
    return Math.ceil(words * 1.4) + Math.ceil(text.length / 50);
  }
}
