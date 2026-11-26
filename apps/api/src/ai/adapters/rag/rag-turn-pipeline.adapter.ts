import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  IRAGTurnPipelinePort,
  RAGTurnExecutionCommand,
  RAGTurnExecutionResult,
  RAGTurnExecutionOutcome,
  IGenerateGroundedAnswerUseCase,
  GENERATE_GROUNDED_ANSWER_USE_CASE_PORT,
  GenerationCancelledException,
  ProviderTimeoutException,
  VisibilityScope,
} from '@kinergy-platform/core';

/**
 * Adapter bridging AI-09.3 conversation turn execution to the AI-08 RAG grounded generation pipeline.
 *
 * Guarantees:
 * 1. AI-08 is invoked through the canonical IGenerateGroundedAnswerUseCase port.
 * 2. Canonical conversation history is supplied directly to AI-08 without creating a secondary store.
 * 3. Does NOT pass conversationId to AI-08 so AI-08 never writes to in-memory or duplicate tables.
 * 4. Catches and translates pipeline cancellations, abstentions, and errors into typed outcomes.
 * 5. Returns verifiable source citations and telemetry metadata for AI-09.3 persistence.
 */
@Injectable()
export class RAGTurnPipelineAdapter implements IRAGTurnPipelinePort {
  private readonly logger = new Logger(RAGTurnPipelineAdapter.name);

  constructor(
    @Inject(GENERATE_GROUNDED_ANSWER_USE_CASE_PORT)
    private readonly ragOrchestrator: IGenerateGroundedAnswerUseCase,
  ) {}

  public async executeTurn(command: RAGTurnExecutionCommand): Promise<RAGTurnExecutionResult> {
    try {
      const ragAnswer = await this.ragOrchestrator.execute({
        query: command.userPrompt,
        authContext: {
          tenantId: command.tenantId,
          userId: command.actorContext.userId,
          roles: [...command.actorContext.roles],
          allowedVisibilityScopes: this.resolveVisibilityScopes(command.actorContext.roles),
        },
        // We pass the canonical history directly as ChatMessage objects.
        // Omit conversationId so AI-08 does not maintain a second in-memory/duplicate store.
        conversationHistory: command.canonicalHistory,
        signal: command.signal,
        searchMode: command.executionConfig?.searchMode,
        topK: command.executionConfig?.topK,
        minSimilarity: command.executionConfig?.minSimilarity,
        documentIds: command.executionConfig?.documentIds
          ? [...command.executionConfig.documentIds]
          : undefined,
        requestId: command.requestId,
        correlationId: command.correlationId,
      });

      const finishReason = ragAnswer.metadata?.finishReason;
      const isAbstention =
        !ragAnswer.grounded &&
        (finishReason === 'insufficient_context' ||
          finishReason === 'LOW_SIMILARITY' ||
          finishReason === 'CONTEXT_BUDGET_EXCEEDED' ||
          finishReason === 'INSUFFICIENT_EVIDENCE' ||
          finishReason === 'EMPTY_CHUNK_CONTENT');

      const outcome: RAGTurnExecutionOutcome = isAbstention ? 'ABSTAINED' : 'SUCCESS';

      return {
        outcome,
        content: ragAnswer.answer,
        isGrounded: ragAnswer.grounded,
        sources: ragAnswer.sources,
        metadata: {
          ...ragAnswer.metadata,
        },
      };
    } catch (error: unknown) {
      const partialContent =
        typeof (error as { partialContent?: unknown })?.partialContent === 'string'
          ? (error as { partialContent: string }).partialContent
          : '';

      if (
        error instanceof GenerationCancelledException ||
        (error instanceof Error && error.name === 'AbortError') ||
        (command.signal && command.signal.aborted)
      ) {
        this.logger.log(`Turn '${command.turnId}' execution was cancelled.`);
        return {
          outcome: 'CANCELLED',
          content: partialContent,
          isGrounded: false,
          sources: [],
          metadata: {
            model: 'none',
            retrievalCount: 0,
            latencyMs: 0,
            finishReason: 'cancelled',
          },
          errorMessage: 'Generation was cancelled.',
        };
      }

      if (
        error instanceof ProviderTimeoutException ||
        (error instanceof Error && error.name === 'TimeoutError')
      ) {
        this.logger.warn(
          `Turn '${command.turnId}' execution timed out: ${(error as Error).message}`,
        );
        return {
          outcome: 'FAILED',
          content: partialContent,
          isGrounded: false,
          sources: [],
          metadata: {
            model: 'none',
            retrievalCount: 0,
            latencyMs: 0,
            finishReason: 'timeout',
          },
          errorCode: 'PROVIDER_TIMEOUT',
          errorMessage: (error as Error).message,
        };
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown generation error';
      const errorCode =
        (error as { code?: string })?.code ??
        (error as { errorCode?: string })?.errorCode ??
        'RAG_GENERATION_FAILED';

      this.logger.error(`Turn '${command.turnId}' execution failed: ${errorMessage}`);

      return {
        outcome: 'FAILED',
        content: partialContent,
        isGrounded: false,
        sources: [],
        metadata: {
          model: 'none',
          retrievalCount: 0,
          latencyMs: 0,
          finishReason: 'error',
        },
        errorCode,
        errorMessage,
      };
    }
  }

  private resolveVisibilityScopes(roles: readonly string[]): VisibilityScope[] {
    const scopes = new Set<VisibilityScope>([VisibilityScope.ALL_STAFF]);
    for (const r of roles) {
      const lower = r.toLowerCase();
      if (['owner', 'superadmin', 'admin', 'management', 'manager'].includes(lower)) {
        scopes.add(VisibilityScope.CLINICAL_STAFF);
        scopes.add(VisibilityScope.MANAGEMENT);
      } else if (['doctor', 'physiotherapist', 'therapist', 'clinical'].includes(lower)) {
        scopes.add(VisibilityScope.CLINICAL_STAFF);
      }
    }
    return Array.from(scopes);
  }
}
