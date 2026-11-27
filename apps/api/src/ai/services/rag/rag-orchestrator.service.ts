import { Injectable, Inject, Optional, Logger } from '@nestjs/common';
import {
  IGenerateGroundedAnswerUseCase,
  GenerateGroundedAnswerCommand,
  ISemanticSearchUseCase,
  SEMANTIC_SEARCH_USE_CASE_PORT,
  IRAGContextBuilderPort,
  RAG_CONTEXT_BUILDER_PORT,
  IGroundedGenerationPort,
  GROUNDED_GENERATION_PORT,
  ICitationValidatorPort,
  CITATION_VALIDATOR_PORT,
  IConversationHistoryManagerPort,
  CONVERSATION_HISTORY_MANAGER_PORT,
  RAGAnswer,
  RetrievalSearchMode,
  UnauthorizedRetrievalException,
  EmptyRetrievalQueryException,
  ProviderTimeoutException,
  GenerationCancelledException,
  VisibilityScope,
} from '@kinergy-platform/core';
import { AI_CONFIG_TOKEN, GENERATION_OBSERVABILITY_SERVICE } from '../../ai.tokens';
import { AiConfiguration, DEFAULT_AI_CONFIG } from '../../config/ai.config';
import { CitationValidatorService } from './citation-validator.service';
import { ConversationHistoryManagerService } from './conversation-history-manager.service';
import {
  GenerationObservabilityService,
  GenerationOutcome,
} from './generation-observability.service';

/**
 * Production implementation of IGenerateGroundedAnswerUseCase.
 *
 * Orchestration Workflow:
 * 1. Validates authenticated user and tenant context (fail-closed).
 * 2. Reuses existing authorized retrieval pipeline (ISemanticSearchUseCase).
 * 3. Enforces deterministic application-level abstention:
 *    - Short-circuits without LLM invocation if retrieval returns zero chunks,
 *      empty text, or if top similarity score is below the calibrated threshold (0.60).
 * 4. Constructs bounded, untrusted XML context via IRAGContextBuilderPort.
 * 5. Invokes grounded LLM generation via IGroundedGenerationPort.
 * 6. Resolves and maps citations back to authorized knowledge chunks.
 * 7. Emits structured RAGAnswer response.
 */
@Injectable()
export class RAGOrchestratorService implements IGenerateGroundedAnswerUseCase {
  private readonly logger = new Logger(RAGOrchestratorService.name);
  private readonly config: AiConfiguration;
  private readonly citationValidator: ICitationValidatorPort;
  private readonly historyManager: IConversationHistoryManagerPort;
  private readonly observability: GenerationObservabilityService;

  constructor(
    @Inject(SEMANTIC_SEARCH_USE_CASE_PORT)
    private readonly retrievalUseCase: ISemanticSearchUseCase,
    @Inject(RAG_CONTEXT_BUILDER_PORT)
    private readonly contextBuilder: IRAGContextBuilderPort,
    @Inject(GROUNDED_GENERATION_PORT)
    private readonly groundedGenerator: IGroundedGenerationPort,
    @Optional()
    @Inject(CITATION_VALIDATOR_PORT)
    citationValidator?: ICitationValidatorPort,
    @Optional()
    @Inject(CONVERSATION_HISTORY_MANAGER_PORT)
    historyManager?: IConversationHistoryManagerPort,
    @Optional()
    @Inject(GENERATION_OBSERVABILITY_SERVICE)
    observability?: GenerationObservabilityService,
    @Optional()
    @Inject(AI_CONFIG_TOKEN)
    config?: AiConfiguration,
  ) {
    const isCitationValidator = (val: unknown): val is ICitationValidatorPort =>
      typeof val === 'object' &&
      val !== null &&
      'validateResponse' in val &&
      typeof (val as { validateResponse: unknown }).validateResponse === 'function';

    const isHistoryManager = (val: unknown): val is IConversationHistoryManagerPort =>
      typeof val === 'object' &&
      val !== null &&
      'resolveHistory' in val &&
      typeof (val as { resolveHistory: unknown }).resolveHistory === 'function';

    const isObservability = (val: unknown): val is GenerationObservabilityService =>
      typeof val === 'object' &&
      val !== null &&
      'recordGeneration' in val &&
      typeof (val as { recordGeneration: unknown }).recordGeneration === 'function';

    this.citationValidator = isCitationValidator(citationValidator)
      ? citationValidator
      : new CitationValidatorService();

    this.historyManager = isHistoryManager(historyManager)
      ? historyManager
      : new ConversationHistoryManagerService();

    this.observability = isObservability(observability)
      ? observability
      : new GenerationObservabilityService();

    // Merge config from any position passed in testing or DI
    const passedConfig: Partial<AiConfiguration> | undefined =
      config ??
      (!isObservability(observability) &&
      typeof observability === 'object' &&
      observability !== null
        ? (observability as Partial<AiConfiguration>)
        : undefined) ??
      (!isHistoryManager(historyManager) &&
      typeof historyManager === 'object' &&
      historyManager !== null
        ? (historyManager as Partial<AiConfiguration>)
        : undefined) ??
      (!isCitationValidator(citationValidator) &&
      typeof citationValidator === 'object' &&
      citationValidator !== null
        ? (citationValidator as Partial<AiConfiguration>)
        : undefined);

    this.config = { ...DEFAULT_AI_CONFIG, ...passedConfig };
  }

  public async execute(command: GenerateGroundedAnswerCommand): Promise<RAGAnswer> {
    const startTime = performance.now();
    const requestId = command.requestId ?? `req-${Date.now()}`;
    const correlationId = command.correlationId ?? requestId;

    // 1. Mandatory server-side authorization and query validation
    if (
      !command.authContext ||
      !command.authContext.tenantId ||
      command.authContext.tenantId.trim().length === 0
    ) {
      throw new UnauthorizedRetrievalException('Tenant identification is required.');
    }

    if (!command.query || typeof command.query !== 'string' || command.query.trim().length === 0) {
      throw new EmptyRetrievalQueryException('Query string must be non-empty.');
    }

    const tenantId = command.authContext.tenantId.trim();
    const query = command.query.trim();

    // 1a. Pipeline-wide timeout controller
    const overallTimeoutMs = this.config.requestTimeoutMs ?? 30000;
    const pipelineController = new AbortController();
    const overallTimeoutId = setTimeout(() => {
      pipelineController.abort();
    }, overallTimeoutMs);

    if (command.signal) {
      if (command.signal.aborted) {
        clearTimeout(overallTimeoutId);
        throw new GenerationCancelledException();
      }
      command.signal.addEventListener('abort', () => pipelineController.abort());
    }

    let retrievalDurationMs = 0;
    let contextDurationMs = 0;
    let generationDurationMs = 0;
    let validationDurationMs = 0;

    try {
      // 1b. Resolve and Authorize Conversation History (tenant-isolated, bounded, injection-sanitized)
      const historyResolution = await this.historyManager.resolveHistory({
        authContext: command.authContext,
        query,
        conversationId: command.conversationId,
        clientHistory: command.conversationHistory,
      });
      const activeHistory = historyResolution.boundedHistory;

      // 2. Delegate to authorized retrieval pipeline
      // Symmetrically enforces tenant isolation, RBAC scopes, and soft-delete filters in SQL
      // Preserves raw user query without generative query rewriting (AI-07.6)
      const retrievalStartTime = performance.now();
      const retrievalResult = await this.retrievalUseCase.execute({
        query,
        authContext: command.authContext,
        topK: command.topK ?? this.config.retrievalDefaultTopK ?? 5,
        minSimilarity: command.minSimilarity ?? this.config.retrievalSimilarityThreshold ?? 0.6,
        documentIds: command.documentIds,
        searchMode:
          command.searchMode ??
          (this.config.retrievalSearchMode as RetrievalSearchMode) ??
          RetrievalSearchMode.SEMANTIC,
        signal: pipelineController.signal,
        requestId,
        correlationId,
      });
      retrievalDurationMs = performance.now() - retrievalStartTime;

      // 3. Application-Level Abstention Policy (No Unnecessary LLM Invocation)

      // Case 3A: Zero chunks returned from authorized retrieval
      if (!retrievalResult.chunks || retrievalResult.chunks.length === 0) {
        const totalDurationMs = Math.round(performance.now() - startTime);
        this.logger.debug(
          `[Tenant: ${tenantId}] Zero authorized chunks returned for query. Abstaining without LLM call.`,
        );
        this.observability.recordGeneration({
          requestId,
          correlationId,
          tenantId,
          userId: command.authContext.userId,
          query,
          modelIdentifier: this.config.chatModel,
          promptVersion: 'none',
          retrievalCount: 0,
          contextChunkCount: 0,
          inputTokenEstimate: 0,
          outputTokenCount: 0,
          retrievalDurationMs,
          contextDurationMs: 0,
          generationDurationMs: 0,
          validationDurationMs: 0,
          totalDurationMs,
          retryCount: 0,
          outcome: 'ABSTAINED',
          citationCount: 0,
          isGrounded: false,
          abstentionReason: 'INSUFFICIENT_EVIDENCE',
        });
        return RAGAnswer.abstain(
          'No se encontró documentación o política verificada para responder a esta consulta.',
          'none',
          totalDurationMs,
        );
      }

      // Case 3B: Chunks exist but contain purely empty/whitespace text or fail authorization sanity check
      // Defense-in-depth: Ensure chunks strictly match the query's authorized tenant and visibility scopes
      const authorizedScopes = command.authContext.allowedVisibilityScopes;
      const validChunks = retrievalResult.chunks.filter((c) => {
        if (!c.content || c.content.trim().length === 0) {
          return false;
        }
        // If chunk has visibilityScope metadata and authorizedScopes is provided, verify scope boundary
        const chunkScope = (c.metadata as { visibilityScope?: string } | undefined)
          ?.visibilityScope;
        if (
          authorizedScopes &&
          authorizedScopes.length > 0 &&
          chunkScope &&
          !authorizedScopes.includes(chunkScope as VisibilityScope)
        ) {
          this.logger.error(
            `[Defense-in-depth] Chunk ${c.chunkId.value} scope (${chunkScope}) violates authorized scopes (${authorizedScopes.join(',')}). Dropping chunk.`,
          );
          return false;
        }
        return true;
      });

      if (validChunks.length === 0) {
        const totalDurationMs = Math.round(performance.now() - startTime);
        this.logger.debug(
          `[Tenant: ${tenantId}] Retrieved chunks contain no non-empty content. Abstaining without LLM call.`,
        );
        this.observability.recordGeneration({
          requestId,
          correlationId,
          tenantId,
          userId: command.authContext.userId,
          query,
          modelIdentifier: this.config.chatModel,
          promptVersion: 'none',
          retrievalCount: retrievalResult.chunks.length,
          contextChunkCount: 0,
          inputTokenEstimate: 0,
          outputTokenCount: 0,
          retrievalDurationMs,
          contextDurationMs: 0,
          generationDurationMs: 0,
          validationDurationMs: 0,
          totalDurationMs,
          retryCount: 0,
          outcome: 'ABSTAINED',
          citationCount: 0,
          isGrounded: false,
          abstentionReason: 'EMPTY_CHUNK_CONTENT',
        });
        return RAGAnswer.abstain(
          'No se encontró documentación con contenido verificable para responder a esta consulta.',
          'none',
          totalDurationMs,
        );
      }

      // Case 3C: Low-confidence / Out-of-domain retrieval
      const minSimilarityThreshold =
        command.minSimilarity ?? this.config.retrievalSimilarityThreshold ?? 0.6;
      const topSimilarityScore = Math.max(...validChunks.map((c) => c.similarity.value));

      if (topSimilarityScore < minSimilarityThreshold) {
        const totalDurationMs = Math.round(performance.now() - startTime);
        this.logger.debug(
          `[Tenant: ${tenantId}] Top chunk similarity (${topSimilarityScore.toFixed(3)}) is below threshold (${minSimilarityThreshold}). Abstaining without LLM call.`,
        );
        this.observability.recordGeneration({
          requestId,
          correlationId,
          tenantId,
          userId: command.authContext.userId,
          query,
          modelIdentifier: this.config.chatModel,
          promptVersion: 'none',
          retrievalCount: retrievalResult.chunks.length,
          contextChunkCount: 0,
          inputTokenEstimate: 0,
          outputTokenCount: 0,
          retrievalDurationMs,
          contextDurationMs: 0,
          generationDurationMs: 0,
          validationDurationMs: 0,
          totalDurationMs,
          retryCount: 0,
          outcome: 'ABSTAINED',
          citationCount: 0,
          isGrounded: false,
          abstentionReason: 'LOW_SIMILARITY',
        });
        return RAGAnswer.abstain(
          'La información disponible no cuenta con suficiente relevancia para responder con certeza a esta consulta.',
          'none',
          totalDurationMs,
        );
      }

      // 4. Construct Bounded Generation Context with strict provenance and diversity controls
      const contextStartTime = performance.now();
      const constructedContext = await this.contextBuilder.buildContext({
        query,
        evidenceChunks: validChunks,
        conversationHistory: activeHistory,
        options: {
          tenantId,
          allowedVisibilityScopes: authorizedScopes,
          maxSources: 5,
          maxChunksPerSource: 3,
          filterSuspiciousContent: true,
        },
      });
      contextDurationMs = performance.now() - contextStartTime;

      if (!constructedContext.includedChunks || constructedContext.includedChunks.length === 0) {
        const totalDurationMs = Math.round(performance.now() - startTime);
        this.logger.warn(
          `[Tenant: ${tenantId}] All evidence chunks exceeded context token budget. Abstaining.`,
        );
        this.observability.recordGeneration({
          requestId,
          correlationId,
          tenantId,
          userId: command.authContext.userId,
          query,
          modelIdentifier: this.config.chatModel,
          promptVersion: 'none',
          retrievalCount: retrievalResult.chunks.length,
          contextChunkCount: 0,
          inputTokenEstimate: 0,
          outputTokenCount: 0,
          retrievalDurationMs,
          contextDurationMs,
          generationDurationMs: 0,
          validationDurationMs: 0,
          totalDurationMs,
          retryCount: 0,
          outcome: 'ABSTAINED',
          citationCount: 0,
          isGrounded: false,
          abstentionReason: 'CONTEXT_BUDGET_EXCEEDED',
        });
        return RAGAnswer.abstain(
          'El contexto de evidencia no pudo ser procesado dentro de los límites de tamaño permitidos.',
          'none',
          totalDurationMs,
        );
      }

      // 5. Invoke Grounded Generation via ILLMProviderPort (bounded by pipelineController signal)
      const generationStartTime = performance.now();
      const generationResult = await this.groundedGenerator.generateGroundedAnswer({
        query,
        constructedContext,
        conversationHistory: activeHistory,
        signal: pipelineController.signal,
      });
      generationDurationMs = performance.now() - generationStartTime;

      // 6. Authoritative Citation Validation & Groundedness Verification
      const validationStartTime = performance.now();
      const validation = this.citationValidator.validateResponse({
        query,
        constructedContext,
        generationResult,
        requestId,
        correlationId,
      });
      validationDurationMs = performance.now() - validationStartTime;

      // 7. Record turn in persistent/in-memory session if conversation tracking is enabled
      if (command.conversationId) {
        await this.historyManager.recordTurn({
          tenantId,
          userId: command.authContext.userId,
          conversationId: command.conversationId,
          query,
          answer: validation.adjustedAnswer,
        });
      }

      const totalDurationMs = Math.round(performance.now() - startTime);

      // 8. Record telemetry log for successful/ungrounded generation
      this.observability.recordGeneration({
        requestId,
        correlationId,
        tenantId,
        userId: command.authContext.userId,
        query,
        modelIdentifier: generationResult.modelIdentifier,
        promptVersion: generationResult.promptVersion,
        retrievalCount: retrievalResult.chunks.length,
        contextChunkCount: constructedContext.includedChunks.length,
        inputTokenEstimate: constructedContext.totalContextTokens,
        outputTokenCount: generationResult.completionTokens,
        retrievalDurationMs,
        contextDurationMs,
        generationDurationMs,
        validationDurationMs,
        totalDurationMs,
        retryCount: 0,
        outcome: validation.isGrounded ? 'SUCCESS' : 'UNGROUNDED',
        citationCount: validation.verifiedCitations.length,
        isGrounded: validation.isGrounded,
        abstentionReason: validation.abstentionReason ?? undefined,
      });

      // 9. Enforce final grounded response contract
      return RAGAnswer.create({
        answer: validation.adjustedAnswer,
        grounded: validation.isGrounded,
        sources: validation.verifiedCitations,
        metadata: {
          model: generationResult.modelIdentifier,
          retrievalCount: retrievalResult.chunks.length,
          latencyMs: totalDurationMs,
          finishReason: validation.abstentionReason ?? generationResult.finishReason,
        },
      });
    } catch (error: unknown) {
      const totalDurationMs = Math.round(performance.now() - startTime);
      let outcome: GenerationOutcome = 'PROVIDER_ERROR';
      let finalError = error;

      if (command.signal?.aborted || error instanceof GenerationCancelledException) {
        outcome = 'CANCELLED';
        finalError = new GenerationCancelledException();
      } else if (pipelineController.signal.aborted || error instanceof ProviderTimeoutException) {
        outcome = 'TIMEOUT';
        finalError = new ProviderTimeoutException(
          `RAG pipeline execution timed out after ${overallTimeoutMs}ms.`,
        );
      } else if (
        error instanceof UnauthorizedRetrievalException ||
        error instanceof EmptyRetrievalQueryException
      ) {
        outcome = 'VALIDATION_ERROR';
      }

      this.observability.recordGeneration({
        requestId,
        correlationId,
        tenantId,
        userId: command.authContext.userId,
        query,
        modelIdentifier: this.config.chatModel,
        promptVersion: 'none',
        retrievalCount: 0,
        contextChunkCount: 0,
        inputTokenEstimate: 0,
        outputTokenCount: 0,
        retrievalDurationMs,
        contextDurationMs,
        generationDurationMs,
        validationDurationMs,
        totalDurationMs,
        retryCount: 0,
        outcome,
        citationCount: 0,
        isGrounded: false,
        failureCategory: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : String(error),
      });

      throw finalError;
    } finally {
      clearTimeout(overallTimeoutId);
    }
  }
}
