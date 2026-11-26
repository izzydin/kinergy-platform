import { IAiConversationRepositoryPort } from '../../ports/outbound/ai-conversation-repository.port';
import { IAiConversationTurnRepositoryPort } from '../../ports/outbound/ai-conversation-turn-repository.port';
import { IAiConversationMessageRepositoryPort } from '../../ports/outbound/ai-conversation-message-repository.port';
import { IAiConversationCitationRepositoryPort } from '../../ports/outbound/ai-conversation-citation-repository.port';
import { AiConversationCitation } from '../../domain/models/ai-conversation-citation.entity';
import {
  IRAGTurnPipelinePort,
  RAGTurnExecutionConfig,
  RAGTurnExecutionOutcome,
} from '../../ports/inbound/rag-turn-pipeline.port';
import {
  IAiConversationTransactionRunner,
  ConversationTransactionalRepositories,
} from '../ports/ai-conversation-transaction-runner.port';
import { PersistMessageStateUseCase } from './persist-message-state.use-case';
import { LoadCanonicalConversationHistoryUseCase } from './load-canonical-conversation-history.use-case';
import { TurnStatus } from '../../domain/enums/turn-status.enum';
import { GenerationStatus } from '../../domain/enums/generation-status.enum';
import { RAGSourceCitation } from '../../domain/value-objects/rag-source-citation.vo';
import { AiSourceAttributionService } from '../services/ai-source-attribution.service';
import {
  InvalidTurnInputError,
  ConversationNotFoundError,
  TurnNotFoundError,
  TenantOwnershipViolationError,
  InvalidConversationLifecycleError,
} from '../errors/ai-conversation-application.error';

export interface ExecuteConversationTurnInput {
  readonly tenantId: string;
  readonly userId: string;
  readonly conversationId: string;
  readonly turnId: string;
  readonly signal?: AbortSignal;
  readonly executionConfig?: RAGTurnExecutionConfig;
  readonly actorContext: {
    readonly roles: readonly string[];
    readonly permissions: readonly string[];
  };
  readonly requestId?: string;
  readonly correlationId?: string;
}

export interface ExecuteConversationTurnResult {
  readonly conversationId: string;
  readonly turnId: string;
  readonly turnStatus: TurnStatus;
  readonly assistantMessageId: string;
  readonly content: string;
  readonly isCanonical: boolean;
  readonly isGrounded: boolean;
  readonly outcome: RAGTurnExecutionOutcome;
  readonly sources: readonly RAGSourceCitation[];
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly isContextTruncated?: boolean;
  readonly completedTurnsCount?: number;
  readonly errorCode?: string | null;
  readonly errorMessage?: string | null;
}

/**
 * Coordinates execution and terminal lifecycle finalization of a reserved conversation turn through the RAG pipeline.
 *
 * Responsibilities (Clean Integration & Atomic Finalization Boundary):
 * 1. Loads and validates the conversation and reserved turn within the authenticated tenant.
 * 2. Enforces idempotency: retrying an already COMPLETED turn safely returns its canonical result without duplicate LLM execution.
 * 3. Enforces generation eligibility: rejects execution on terminal (cancelled/failed) turns.
 * 4. Associates execution with the active generation attempt and verifies attempt identity.
 * 5. Transitions turn status through approved lifecycle states (PENDING -> STREAMING -> terminal).
 * 6. Retrieves canonical message history as the authoritative source of truth via LoadCanonicalConversationHistoryUseCase.
 * 7. Invokes the AI-08 RAG pipeline via IRAGTurnPipelinePort without leaking persistence or transactions.
 * 8. Atomically finalizes the assistant message, turn status, and conversation activity timestamp in a single transaction.
 * 9. Enforces transactional fencing: ensures a late LLM response cannot overwrite a racing cancellation or superseded attempt.
 */
export class ExecuteConversationTurnUseCase {
  private readonly historyLoader: LoadCanonicalConversationHistoryUseCase;

  constructor(
    private readonly convRepo: IAiConversationRepositoryPort,
    private readonly turnRepo: IAiConversationTurnRepositoryPort,
    private readonly messageRepo: IAiConversationMessageRepositoryPort,
    private readonly persistMessageStateUseCase: PersistMessageStateUseCase,
    private readonly ragPipeline: IRAGTurnPipelinePort,
    historyLoader?: LoadCanonicalConversationHistoryUseCase,
    private readonly txRunner?: IAiConversationTransactionRunner,
    private readonly citationRepo?: IAiConversationCitationRepositoryPort,
  ) {
    this.historyLoader =
      historyLoader ?? new LoadCanonicalConversationHistoryUseCase(convRepo, turnRepo, messageRepo);
  }

  public async execute(
    input: ExecuteConversationTurnInput,
  ): Promise<ExecuteConversationTurnResult> {
    // 1. Validate Input
    if (!input) {
      throw new InvalidTurnInputError('input', 'Execution input cannot be null or undefined.');
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
    const userId = input.userId?.trim();
    if (!userId) {
      throw new InvalidTurnInputError('userId', 'User ID is required.');
    }

    // 2. Pre-flight Validation: Conversation Ownership & Lifecycle
    const conversation = await this.convRepo.findById(tenantId, conversationId);
    if (!conversation) {
      throw new ConversationNotFoundError(conversationId, tenantId);
    }
    if (conversation.tenantId !== tenantId) {
      throw new TenantOwnershipViolationError('AiConversation', conversationId, tenantId);
    }
    if (conversation.isArchived()) {
      throw new InvalidConversationLifecycleError(
        conversationId,
        'Cannot execute generation on an archived or deleted conversation.',
      );
    }

    // 3. Pre-flight Validation: Turn Resolution, Idempotency & Eligibility
    const turn = await this.turnRepo.findById(tenantId, conversationId, turnId);
    if (!turn) {
      throw new TurnNotFoundError(turnId, conversationId, tenantId);
    }

    // Fast-path Idempotency: If turn is already COMPLETED, return the canonical result without re-executing AI-08
    if (turn.status === TurnStatus.COMPLETED) {
      let canonicalMsg = this.messageRepo.findCanonicalAssistantMessage
        ? await this.messageRepo.findCanonicalAssistantMessage(tenantId, conversationId, turnId)
        : null;

      if (!canonicalMsg && turn.activeAttemptId) {
        canonicalMsg = await this.messageRepo.findById(
          tenantId,
          conversationId,
          turn.activeAttemptId.value,
        );
      }

      if (canonicalMsg) {
        const sources = AiSourceAttributionService.deserializeFromPersistence(
          canonicalMsg.sources,
        ) as unknown as readonly RAGSourceCitation[];
        const isGrounded = (canonicalMsg.metadata?.['isGrounded'] as boolean) ?? false;
        const completedTurnsCount =
          (canonicalMsg.metadata?.['historyTurnCount'] as number) ?? undefined;
        const isContextTruncated =
          (canonicalMsg.metadata?.['isContextTruncated'] as boolean) ?? false;

        return {
          conversationId,
          turnId,
          turnStatus: TurnStatus.COMPLETED,
          assistantMessageId: canonicalMsg.id.value,
          content: canonicalMsg.content,
          isCanonical: true,
          isGrounded,
          outcome: 'SUCCESS',
          sources,
          completedTurnsCount,
          isContextTruncated,
          metadata: canonicalMsg.metadata ?? {},
          errorCode: canonicalMsg.errorCode ?? null,
          errorMessage: canonicalMsg.errorMessage ?? null,
        };
      }
    }

    // Reject execution on terminal non-completed turns (CANCELLED, INTERRUPTED, FAILED)
    if (turn.isTerminal()) {
      throw new InvalidConversationLifecycleError(
        conversationId,
        `Cannot execute generation on turn '${turnId}' in terminal status '${turn.status}'.`,
      );
    }

    // Verify active generation attempt is allocated
    if (!turn.activeAttemptId) {
      throw new InvalidTurnInputError(
        'activeAttemptId',
        `Turn '${turnId}' has no active generation attempt allocated.`,
      );
    }

    // 4. Transition Turn to STREAMING
    if (this.turnRepo.updateStatus && turn.status !== TurnStatus.STREAMING) {
      await this.turnRepo.updateStatus(tenantId, conversationId, turnId, {
        status: TurnStatus.STREAMING,
      });
    }

    // 5. Load & Validate Canonical Conversation History Context (Authoritative Source of Truth)
    const canonicalContext = await this.historyLoader.execute({
      tenantId,
      conversationId,
      turnId,
      maxCompletedTurns: input.executionConfig?.maxHistoryTurns ?? 10,
    });

    const userMessage = canonicalContext.currentUserMessage;
    const assistantAttempt = canonicalContext.currentAssistantAttempt;
    const historyChatMessages = [...canonicalContext.priorCanonicalMessages];

    // Fencing token check: verify that loaded attempt matches turn's active attempt identity
    if (
      assistantAttempt.id.value !== turn.activeAttemptId.value ||
      assistantAttempt.attemptNumber !== turn.activeAttemptNumber
    ) {
      throw new InvalidConversationLifecycleError(
        conversationId,
        `Turn active attempt mismatch: expected attempt '${turn.activeAttemptId.value}', found '${assistantAttempt.id.value}'.`,
      );
    }

    // Pre-execution abort check: immediately abort if torn down or shutting down
    if (input.signal?.aborted) {
      const reasonMsg =
        input.signal.reason instanceof Error
          ? input.signal.reason.message
          : typeof input.signal.reason === 'string'
            ? input.signal.reason
            : '';
      if (reasonMsg === 'TEARDOWN' || reasonMsg === 'WORKER_SHUTDOWN') {
        throw new Error(`Turn execution aborted before pipeline execution: ${reasonMsg}`);
      }
    }

    // 6. Invoke AI-08 RAG Pipeline through the Integration Boundary
    const ragResult = await this.ragPipeline.executeTurn({
      tenantId,
      conversationId,
      turnId,
      userMessageId: userMessage.id.value,
      userPrompt: userMessage.content,
      canonicalHistory: historyChatMessages,
      attemptId: assistantAttempt.id.value,
      attemptNumber: assistantAttempt.attemptNumber,
      executionConfig: input.executionConfig,
      signal: input.signal,
      requestId: input.requestId,
      correlationId: input.correlationId,
      actorContext: {
        userId,
        roles: input.actorContext?.roles ?? [],
        permissions: input.actorContext?.permissions ?? [],
      },
    });

    // Post-execution abort check: prevent entering atomic finalization transaction on teardown / shutdown abort
    if (input.signal?.aborted) {
      const reasonMsg =
        input.signal.reason instanceof Error
          ? input.signal.reason.message
          : typeof input.signal.reason === 'string'
            ? input.signal.reason
            : 'GENERATION_ABORTED';
      if (reasonMsg === 'TEARDOWN' || reasonMsg === 'WORKER_SHUTDOWN') {
        throw new Error(`Turn execution aborted during pipeline execution: ${reasonMsg}`);
      }
    }

    // 7. Atomic Turn & Message Finalization with Fencing
    const finalizeWork = async (repos: ConversationTransactionalRepositories) => {
      // 7a. Re-read turn inside transaction to enforce transactional fencing
      const inTxTurn = await repos.turnRepo.findById(tenantId, conversationId, turnId);
      if (!inTxTurn) {
        throw new TurnNotFoundError(turnId, conversationId, tenantId);
      }

      // 7b. Fencing Guard: If turn already reached terminal state concurrently
      if (inTxTurn.isTerminal()) {
        if (inTxTurn.status === TurnStatus.COMPLETED) {
          const validatedSources = AiSourceAttributionService.validateAndSanitize(
            ragResult.sources,
            {
              allowedDocumentIds: input.executionConfig?.documentIds,
            },
          ) as unknown as readonly RAGSourceCitation[];
          return {
            aborted: false,
            turnStatus: TurnStatus.COMPLETED,
            isCanonical: true,
            outcome: 'SUCCESS' as const,
            sources: validatedSources,
            errorCode: null,
            errorMessage: null,
          };
        }

        // Concurrent cancellation / interruption / failure won: late LLM response must NOT overwrite terminal state!
        return {
          aborted: true,
          turnStatus: inTxTurn.status,
          isCanonical: false,
          outcome: (inTxTurn.status === TurnStatus.CANCELLED
            ? 'CANCELLED'
            : 'FAILED') as RAGTurnExecutionOutcome,
          sources: [],
          errorCode:
            inTxTurn.status === TurnStatus.CANCELLED ? 'GENERATION_CANCELLED' : 'GENERATION_FAILED',
          errorMessage: `Generation aborted because turn was ${inTxTurn.status.toLowerCase()} concurrently.`,
        };
      }

      // 7c. Fencing Guard: Stale attempt detection (superseded by newer attempt)
      if (
        inTxTurn.activeAttemptId?.value !== assistantAttempt.id.value ||
        inTxTurn.activeAttemptNumber !== assistantAttempt.attemptNumber
      ) {
        return {
          aborted: true,
          turnStatus: inTxTurn.status,
          isCanonical: false,
          outcome: 'FAILED' as const,
          sources: [],
          errorCode: 'ATTEMPT_SUPERSEDED',
          errorMessage: 'Generation aborted: attempt was superseded by a newer attempt.',
        };
      }

      // 7d. Atomic Persistence
      const completedAt = new Date();
      let finalTurnStatus: TurnStatus;
      let isCanonical: boolean;
      let messageStatus: GenerationStatus;
      let finalSources: readonly RAGSourceCitation[];
      let finalErrorCode: string | null = null;
      let finalErrorMessage: string | null = null;

      const targetPersistUseCase =
        repos.messageRepo === this.messageRepo
          ? this.persistMessageStateUseCase
          : new PersistMessageStateUseCase(repos.messageRepo);

      if (ragResult.outcome === 'SUCCESS' || ragResult.outcome === 'ABSTAINED') {
        isCanonical = true;
        finalTurnStatus = TurnStatus.COMPLETED;
        messageStatus = GenerationStatus.SUCCESS;

        const validatedSources = AiSourceAttributionService.validateAndSanitize(ragResult.sources, {
          allowedDocumentIds: input.executionConfig?.documentIds,
        });
        finalSources = validatedSources as unknown as readonly RAGSourceCitation[];
        const serializedSources =
          AiSourceAttributionService.serializeForPersistence(validatedSources);

        // FB.05: Demote any previous canonical assistant message for this turn to preserve single canonical invariant
        if (repos.messageRepo.findCanonicalAssistantMessage && repos.messageRepo.updateStatus) {
          try {
            const previousCanonical = await repos.messageRepo.findCanonicalAssistantMessage(
              tenantId,
              conversationId,
              turnId,
            );
            if (previousCanonical && previousCanonical.id.value !== assistantAttempt.id.value) {
              await repos.messageRepo.updateStatus(
                tenantId,
                conversationId,
                previousCanonical.id.value,
                {
                  status: previousCanonical.status,
                  isCanonical: false,
                },
              );
            }
          } catch {
            // Non-fatal if prior message resolution fails in non-relational or mock environments
          }
        }

        await targetPersistUseCase.execute({
          tenantId,
          conversationId,
          messageId: assistantAttempt.id.value,
          status: messageStatus,
          content: ragResult.content,
          isCanonical: true,
          completedAt,
          sources: serializedSources,
          metadata: {
            ...ragResult.metadata,
            isGrounded: ragResult.isGrounded,
            outcome: ragResult.outcome,
            isContextTruncated: canonicalContext.isContextTruncated,
            historyTurnCount: canonicalContext.completedTurnsCount,
          },
        });

        // CIT.02: Persist dedicated citation records for first-class relational provenance
        const effectiveCitationRepo = repos.citationRepo ?? this.citationRepo;
        if (effectiveCitationRepo && validatedSources.length > 0) {
          const citationsToPersist = validatedSources.map((source, idx) =>
            AiConversationCitation.create({
              id: source.citationId ?? undefined,
              tenantId,
              conversationId,
              turnId,
              messageId: assistantAttempt.id.value,
              documentId: source.documentId,
              documentVersionId: source.documentVersionId ?? null,
              chunkId: source.chunkId ?? null,
              citationPosition: idx + 1,
              documentTitleSnapshot: source.documentTitle,
              excerpt: source.excerpt || source.documentTitle || 'Evidence excerpt unavailable',
              pageNumber: source.pageNumber ?? null,
              headingPath: source.headingPath ?? [],
              relevanceScore: source.relevanceScore,
              retrievalRank: source.retrievalRank ?? idx + 1,
              sourceStrategy: source.sourceStrategy ?? null,
            }),
          );
          await effectiveCitationRepo.saveMany(citationsToPersist);
        }
      } else if (ragResult.outcome === 'CANCELLED') {
        isCanonical = false;
        finalTurnStatus = TurnStatus.CANCELLED;
        messageStatus = GenerationStatus.CANCELLED;
        finalSources = [];
        finalErrorCode = 'GENERATION_CANCELLED';
        finalErrorMessage = ragResult.errorMessage ?? 'Generation was cancelled.';

        await targetPersistUseCase.execute({
          tenantId,
          conversationId,
          messageId: assistantAttempt.id.value,
          status: messageStatus,
          isCanonical: false,
          content: ragResult.content ? ragResult.content : undefined,
          completedAt,
          errorCode: finalErrorCode,
          errorMessage: finalErrorMessage,
        });
      } else {
        isCanonical = false;
        finalTurnStatus = TurnStatus.FAILED;
        messageStatus = GenerationStatus.FAILED;
        finalSources = [];
        finalErrorCode = ragResult.errorCode ?? 'GENERATION_FAILED';
        finalErrorMessage = ragResult.errorMessage ?? 'Generation failed.';

        await targetPersistUseCase.execute({
          tenantId,
          conversationId,
          messageId: assistantAttempt.id.value,
          status: messageStatus,
          isCanonical: false,
          content: ragResult.content ? ragResult.content : undefined,
          completedAt,
          errorCode: finalErrorCode,
          errorMessage: finalErrorMessage,
        });
      }

      // 7e. Atomically update Turn status
      if (repos.turnRepo.updateStatus) {
        await repos.turnRepo.updateStatus(tenantId, conversationId, turnId, {
          status: finalTurnStatus,
          completedAt,
        });
      }

      // 7f. Atomically touch conversation lastActivityAt
      if (repos.conversationRepo.updateMetadata) {
        await repos.conversationRepo.updateMetadata(tenantId, conversationId, {
          lastActivityAt: completedAt,
        });
      }

      return {
        aborted: false,
        turnStatus: finalTurnStatus,
        isCanonical,
        completedAt,
        outcome: ragResult.outcome,
        sources: finalSources,
        errorCode: finalErrorCode,
        errorMessage: finalErrorMessage,
      };
    };

    const finalizationResult = this.txRunner
      ? await this.txRunner.runInTransaction(
          async (txRepos: ConversationTransactionalRepositories) => finalizeWork(txRepos),
        )
      : await finalizeWork({
          conversationRepo: this.convRepo,
          turnRepo: this.turnRepo,
          messageRepo: this.messageRepo,
          citationRepo: this.citationRepo,
        });

    if (finalizationResult.aborted) {
      return {
        conversationId,
        turnId,
        turnStatus: finalizationResult.turnStatus,
        assistantMessageId: assistantAttempt.id.value,
        content: '',
        isCanonical: false,
        isGrounded: false,
        outcome: finalizationResult.outcome,
        sources: [],
        metadata: {
          aborted: true,
          errorCode: finalizationResult.errorCode,
        },
        isContextTruncated: canonicalContext.isContextTruncated,
        completedTurnsCount: canonicalContext.completedTurnsCount,
        errorCode: finalizationResult.errorCode ?? null,
        errorMessage: finalizationResult.errorMessage ?? null,
      };
    }

    return {
      conversationId,
      turnId,
      turnStatus: finalizationResult.turnStatus,
      assistantMessageId: assistantAttempt.id.value,
      content: ragResult.content,
      isCanonical: finalizationResult.isCanonical,
      isGrounded: ragResult.isGrounded,
      outcome: ragResult.outcome,
      sources: finalizationResult.sources ?? ragResult.sources,
      isContextTruncated: canonicalContext.isContextTruncated,
      completedTurnsCount: canonicalContext.completedTurnsCount,
      metadata: {
        ...ragResult.metadata,
        outcome: ragResult.outcome,
        isGrounded: ragResult.isGrounded,
        isContextTruncated: canonicalContext.isContextTruncated,
        historyTurnCount: canonicalContext.completedTurnsCount,
      },
      errorCode: finalizationResult.errorCode ?? null,
      errorMessage: finalizationResult.errorMessage ?? null,
    };
  }
}
