import {
  Module,
  DynamicModule,
  Global,
  OnApplicationBootstrap,
  Logger,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AI_LLM_PROVIDER_TOKEN,
  AI_EMBEDDING_PROVIDER_TOKEN,
  AI_CONFIG_TOKEN,
  KNOWLEDGE_DOCUMENT_REPOSITORY,
  INGESTION_JOB_REPOSITORY,
  DOCUMENT_CONTENT_VALIDATOR,
  SECURE_DOCUMENT_UPLOAD_SERVICE,
  INGESTION_ORCHESTRATOR_SERVICE,
  INGESTION_RECOVERY_WORKER,
  DOCUMENT_PARSER_TOKEN,
  LANGUAGE_DETECTOR_TOKEN,
  DOCUMENT_NORMALIZER_TOKEN,
  TOKENIZER_TOKEN,
  DOCUMENT_CHUNKER_TOKEN,
  KNOWLEDGE_CHUNK_REPOSITORY,
  DOCUMENT_PROCESSING_PIPELINE_SERVICE,
  EMBEDDING_GENERATION_PIPELINE_SERVICE,
  INDEX_GENERATION_REPOSITORY,
  VECTOR_STORE_REPOSITORY,
  VECTOR_INDEXING_JOB_REPOSITORY,
  VECTOR_INDEXING_ORCHESTRATOR_SERVICE,
  INDEX_GENERATION_COMPLETENESS_VALIDATOR,
  VECTOR_INDEXING_RECOVERY_WORKER,
  MODEL_CHANGE_DETECTOR_SERVICE,
  VECTOR_CLEANUP_SERVICE,
  INDEX_REINDEXING_SERVICE,
  QUERY_EMBEDDING_SERVICE,
  SEMANTIC_RETRIEVAL_REPOSITORY,
  LEXICAL_RETRIEVAL_REPOSITORY,
  SEMANTIC_SEARCH_USE_CASE,
  RETRIEVAL_SECURITY_POLICY_SERVICE,
  CROSS_ENCODER_RERANKING_SERVICE,
  RAG_CONTEXT_BUILDER_SERVICE,
  GROUNDED_GENERATION_SERVICE,
  GENERATE_GROUNDED_ANSWER_USE_CASE,
  CITATION_VALIDATOR_SERVICE,
  CONVERSATION_REPOSITORY,
  CONVERSATION_HISTORY_MANAGER_SERVICE,
  GENERATION_OBSERVABILITY_SERVICE,
  RAG_TURN_PIPELINE_SERVICE,
  AI_TURN_DISPATCHER_SERVICE,
  AI_TURN_GENERATION_WORKER,
} from './ai.tokens';
import {
  DOCUMENT_INDEXING_PORT,
  INDEX_GENERATION_REPOSITORY_PORT,
  VECTOR_STORE_PORT,
  VECTOR_INDEXING_JOB_REPOSITORY_PORT,
  QUERY_EMBEDDING_USE_CASE_PORT,
  SEMANTIC_RETRIEVAL_PORT,
  LEXICAL_RETRIEVAL_PORT,
  CROSS_ENCODER_RERANKING_PORT,
  SEMANTIC_SEARCH_USE_CASE_PORT,
  KNOWLEDGE_DOCUMENT_REPOSITORY_PORT,
  RAG_CONTEXT_BUILDER_PORT,
  GROUNDED_GENERATION_PORT,
  GENERATE_GROUNDED_ANSWER_USE_CASE_PORT,
  CITATION_VALIDATOR_PORT,
  CONVERSATION_REPOSITORY_PORT,
  CONVERSATION_HISTORY_MANAGER_PORT,
  RAG_TURN_PIPELINE_PORT,
  IRAGTurnPipelinePort,
  AI_CONVERSATION_REPOSITORY_PORT,
  IAiConversationRepositoryPort,
  AI_CONVERSATION_TURN_REPOSITORY_PORT,
  IAiConversationTurnRepositoryPort,
  AI_CONVERSATION_MESSAGE_REPOSITORY_PORT,
  IAiConversationMessageRepositoryPort,
  AI_CONVERSATION_CITATION_REPOSITORY_PORT,
  IAiConversationCitationRepositoryPort,
  AI_CONVERSATION_TRANSACTION_RUNNER,
  IAiConversationTransactionRunner,
  PersistMessageStateUseCase,
  ExecuteConversationTurnUseCase,
  LoadCanonicalConversationHistoryUseCase,
  AI_TURN_DISPATCHER_PORT,
} from '@kinergy-platform/core';
import {
  PdfParserAdapter,
  DocxParserAdapter,
  MarkdownParserAdapter,
  PlainTextParserAdapter,
  CompositeDocumentParserAdapter,
} from './adapters/parsers';
import { LocalCrossEncoderRerankingAdapter } from './adapters/reranking/local-cross-encoder-reranking.adapter';
import {
  DeterministicLanguageDetectorService,
  DeterministicDocumentNormalizerService,
} from './services/normalization';
import { DeterministicBpeTokenizerAdapter } from './adapters/tokenizers/deterministic-bpe-tokenizer.adapter';
import { StructureAwareChunkerService } from './services/chunking/structure-aware-chunker.service';
import { DocumentProcessingPipelineService } from './services/document-processing-pipeline.service';
import { EmbeddingGenerationPipelineService } from './services/embedding-generation-pipeline.service';
import { IndexGenerationCompletenessValidatorService } from './services/indexing/index-generation-completeness-validator.service';
import { VectorIndexingOrchestratorService } from './services/indexing/vector-indexing-orchestrator.service';
import { VectorIndexingRecoveryWorker } from './services/indexing/vector-indexing-recovery.worker';
import { ModelChangeDetectorService } from './services/indexing/model-change-detector.service';
import { VectorCleanupService } from './services/indexing/vector-cleanup.service';
import { IndexReindexingService } from './services/indexing/index-reindexing.service';
import { QueryEmbeddingService } from './services/retrieval/query-embedding.service';
import { RetrievalSecurityPolicyService } from './services/retrieval/retrieval-security-policy.service';
import { SecureSemanticSearchService } from './services/retrieval/secure-semantic-search.service';
import { RetrievalObservabilityService } from './services/retrieval/retrieval-observability.service';
import { RAGContextBuilderService } from './services/rag/rag-context-builder.service';
import { GroundedGenerationService } from './services/rag/grounded-generation.service';
import { CitationValidatorService } from './services/rag/citation-validator.service';
import { ConversationHistoryManagerService } from './services/rag/conversation-history-manager.service';
import { GenerationObservabilityService } from './services/rag/generation-observability.service';
import { InMemoryConversationRepositoryAdapter } from './adapters/conversation/in-memory-conversation-repository.adapter';
import { RAGOrchestratorService } from './services/rag/rag-orchestrator.service';
import { RAGTurnPipelineAdapter } from './adapters/rag/rag-turn-pipeline.adapter';
import { PendingDocumentIndexingAdapter } from './adapters/indexing/pending-document-indexing.adapter';
import { IngestionOrchestratorService } from './services/ingestion-orchestrator.service';
import { IngestionRecoveryWorker } from './services/ingestion-recovery.worker';
import { AiTurnDispatcherService, AiTurnGenerationWorker } from './services/generation';
import { AiConfiguration, DEFAULT_AI_CONFIG } from './config/ai.config';
import { OllamaLLMAdapter } from './adapters/llm/ollama-llm.adapter';
import { OllamaEmbeddingAdapter } from './adapters/embedding/ollama-embedding.adapter';
import { MockLLMAdapter } from './adapters/mocks/mock-llm.adapter';
import { MockEmbeddingAdapter } from './adapters/mocks/mock-embedding.adapter';
import { AiHealthService } from './services/ai-health.service';
import { AiHealthController } from './controllers/ai-health.controller';
import { DocumentContentValidatorService } from './services/document-content-validator.service';
import { SecureDocumentUploadService } from './services/secure-document-upload.service';
import { AiDocumentController } from './controllers/ai-document.controller';
import { AiRAGController } from './controllers/ai-rag.controller';
import { PrismaModule } from '../platform/persistence/prisma/prisma.module';
import { PrismaService } from '../platform/persistence/prisma/prisma.service';
import { StorageModule } from '../platform/storage/storage.module';
import { IdentityModule } from '../platform/identity/identity.module';
import { AiConversationModule } from './conversation/ai-conversation.module';
import {
  PrismaKnowledgeDocumentRepository,
  PrismaIngestionJobRepository,
  PrismaKnowledgeChunkRepository,
  PrismaVectorStoreRepository,
  PrismaIndexGenerationRepository,
  PrismaVectorIndexingJobRepository,
  PrismaSemanticRetrievalRepository,
  PrismaLexicalRetrievalRepository,
} from '@kinergy-platform/core/server';

export interface AiModuleOptions {
  useMocks?: boolean;
}

@Global()
@Module({})
export class AiModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(AiModule.name);

  constructor(
    @Inject(AI_CONFIG_TOKEN) private readonly config: AiConfiguration,
    private readonly healthService: AiHealthService,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    if (!this.config.enabled) {
      this.logger.log('Kynergy Intelligence AI subsystem is DISABLED by default (Rule 6).');
      return;
    }

    if (!this.config.startupCheckEnabled) {
      this.logger.log(
        `Kynergy Intelligence enabled with provider '${this.config.llmProvider}'. Startup health probe is deferred.`,
      );
      return;
    }

    try {
      const report = await this.healthService.getHealthReport();
      if (report.overallStatus === 'OPERATIONAL') {
        this.logger.log(
          `Kynergy Intelligence operational: Chat [${report.models.chat.name}], Embed [${report.models.embedding.name}].`,
        );
      } else {
        this.logger.warn(
          `Kynergy Intelligence startup warning: status is ${report.overallStatus}. Core platform remains operational.`,
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown probe error';
      this.logger.warn(`Kynergy Intelligence probe warning: ${msg}. Core platform unaffected.`);
    }
  }

  public static forRoot(options: AiModuleOptions = {}): DynamicModule {
    const configProvider = {
      provide: AI_CONFIG_TOKEN,
      useFactory: (configService: ConfigService): AiConfiguration => {
        const enabled = configService.get<boolean>('AI_ENABLED', DEFAULT_AI_CONFIG.enabled);
        const llmModel =
          configService.get<string>('AI_CHAT_MODEL') ??
          configService.get<string>('AI_LLM_MODEL', DEFAULT_AI_CONFIG.chatModel);
        const requestTimeoutMs =
          configService.get<number>('AI_OLLAMA_REQUEST_TIMEOUT_MS') ??
          configService.get<number>('AI_TIMEOUT_MS', DEFAULT_AI_CONFIG.requestTimeoutMs);
        const chatMaxConcurrent =
          configService.get<number>('AI_CHAT_MAX_CONCURRENT_REQUESTS') ??
          configService.get<number>(
            'AI_MAX_PARALLEL_GENERATION',
            DEFAULT_AI_CONFIG.chatMaxConcurrent,
          );

        return {
          enabled,
          llmProvider: configService.get<'mock' | 'ollama'>(
            'AI_LLM_PROVIDER',
            DEFAULT_AI_CONFIG.llmProvider,
          ),
          embeddingProvider: configService.get<'mock' | 'ollama'>(
            'AI_EMBEDDING_PROVIDER',
            DEFAULT_AI_CONFIG.embeddingProvider,
          ),
          ollamaBaseUrl: configService.get<string>(
            'AI_OLLAMA_BASE_URL',
            DEFAULT_AI_CONFIG.ollamaBaseUrl,
          ),
          requestTimeoutMs,
          healthTimeoutMs: configService.get<number>(
            'AI_OLLAMA_HEALTH_TIMEOUT_MS',
            DEFAULT_AI_CONFIG.healthTimeoutMs,
          ),
          chatModel: llmModel,
          chatTemperature: configService.get<number>(
            'AI_CHAT_TEMPERATURE',
            DEFAULT_AI_CONFIG.chatTemperature,
          ),
          chatMaxTokens: configService.get<number>(
            'AI_CHAT_MAX_OUTPUT_TOKENS',
            DEFAULT_AI_CONFIG.chatMaxTokens,
          ),
          chatContextWindow: configService.get<number>(
            'AI_CHAT_CONTEXT_WINDOW',
            DEFAULT_AI_CONFIG.chatContextWindow,
          ),
          chatMaxConcurrent,
          embeddingModel: configService.get<string>(
            'AI_EMBEDDING_MODEL',
            DEFAULT_AI_CONFIG.embeddingModel,
          ),
          embeddingDimensions: configService.get<number>(
            'AI_EMBEDDING_DIMENSIONS',
            DEFAULT_AI_CONFIG.embeddingDimensions,
          ),
          embeddingBatchSize: configService.get<number>(
            'AI_EMBEDDING_BATCH_SIZE',
            DEFAULT_AI_CONFIG.embeddingBatchSize,
          ),
          embeddingMaxConcurrent: configService.get<number>(
            'AI_EMBEDDING_MAX_CONCURRENT_REQUESTS',
            DEFAULT_AI_CONFIG.embeddingMaxConcurrent,
          ),
          healthCheckEnabled: configService.get<boolean>(
            'AI_HEALTH_CHECK_ENABLED',
            DEFAULT_AI_CONFIG.healthCheckEnabled,
          ),
          startupCheckEnabled: configService.get<boolean>(
            'AI_PROVIDER_STARTUP_CHECK',
            DEFAULT_AI_CONFIG.startupCheckEnabled,
          ),
          failureThreshold: configService.get<number>(
            'AI_PROVIDER_FAILURE_THRESHOLD',
            DEFAULT_AI_CONFIG.failureThreshold,
          ),
          maxDocumentSizeBytes: Number(
            configService.get<number>(
              'AI_MAX_DOCUMENT_SIZE_BYTES',
              DEFAULT_AI_CONFIG.maxDocumentSizeBytes,
            ),
          ),
          allowedDocumentMimeTypes: DEFAULT_AI_CONFIG.allowedDocumentMimeTypes,
          targetChunkTokens: Number(
            configService.get<number>(
              'AI_TARGET_CHUNK_TOKENS',
              DEFAULT_AI_CONFIG.targetChunkTokens,
            ),
          ),
          minimumChunkTokens: Number(
            configService.get<number>(
              'AI_MINIMUM_CHUNK_TOKENS',
              DEFAULT_AI_CONFIG.minimumChunkTokens,
            ),
          ),
          maximumChunkTokens: Number(
            configService.get<number>(
              'AI_MAXIMUM_CHUNK_TOKENS',
              DEFAULT_AI_CONFIG.maximumChunkTokens,
            ),
          ),
          overlapTokens: Number(
            configService.get<number>('AI_OVERLAP_TOKENS', DEFAULT_AI_CONFIG.overlapTokens),
          ),
          chunkingStrategy:
            configService.get<string>('AI_CHUNKING_STRATEGY', DEFAULT_AI_CONFIG.chunkingStrategy) ??
            DEFAULT_AI_CONFIG.chunkingStrategy,
          retrievalDefaultTopK: Number(
            configService.get<number>(
              'AI_RETRIEVAL_DEFAULT_TOP_K',
              DEFAULT_AI_CONFIG.retrievalDefaultTopK,
            ),
          ),
          retrievalMaxTopK: Number(
            configService.get<number>('AI_RETRIEVAL_MAX_TOP_K', DEFAULT_AI_CONFIG.retrievalMaxTopK),
          ),
          retrievalSimilarityThreshold: Number(
            configService.get<number>(
              'AI_RETRIEVAL_SIMILARITY_THRESHOLD',
              DEFAULT_AI_CONFIG.retrievalSimilarityThreshold,
            ),
          ),
          retrievalEvaluationProfile:
            configService.get<string>(
              'AI_RETRIEVAL_EVALUATION_PROFILE',
              DEFAULT_AI_CONFIG.retrievalEvaluationProfile,
            ) ?? DEFAULT_AI_CONFIG.retrievalEvaluationProfile,
          // Hybrid Search & Fusion Defaults
          retrievalSearchMode:
            configService.get<'SEMANTIC' | 'KEYWORD' | 'HYBRID'>(
              'AI_RETRIEVAL_SEARCH_MODE',
              DEFAULT_AI_CONFIG.retrievalSearchMode,
            ) ?? DEFAULT_AI_CONFIG.retrievalSearchMode,
          retrievalSemanticCandidateLimit: Number(
            configService.get<number>(
              'AI_RETRIEVAL_SEMANTIC_CANDIDATE_LIMIT',
              DEFAULT_AI_CONFIG.retrievalSemanticCandidateLimit,
            ),
          ),
          retrievalKeywordCandidateLimit: Number(
            configService.get<number>(
              'AI_RETRIEVAL_KEYWORD_CANDIDATE_LIMIT',
              DEFAULT_AI_CONFIG.retrievalKeywordCandidateLimit,
            ),
          ),
          retrievalRrfConstant: Number(
            configService.get<number>(
              'AI_RETRIEVAL_RRF_CONSTANT',
              DEFAULT_AI_CONFIG.retrievalRrfConstant,
            ),
          ),
          // Cross-Encoder Reranking
          retrievalRerankerEnabled:
            configService.get<string>('AI_RETRIEVAL_RERANKER_ENABLED') === 'true' ||
            configService.get<boolean>('AI_RETRIEVAL_RERANKER_ENABLED') === true ||
            DEFAULT_AI_CONFIG.retrievalRerankerEnabled,
          retrievalRerankerModel:
            configService.get<string>(
              'AI_RETRIEVAL_RERANKER_MODEL',
              DEFAULT_AI_CONFIG.retrievalRerankerModel,
            ) ?? DEFAULT_AI_CONFIG.retrievalRerankerModel,
          retrievalRerankerProvider:
            configService.get<'mock' | 'tei' | 'http'>(
              'AI_RETRIEVAL_RERANKER_PROVIDER',
              DEFAULT_AI_CONFIG.retrievalRerankerProvider,
            ) ?? DEFAULT_AI_CONFIG.retrievalRerankerProvider,
          retrievalRerankerEndpoint:
            configService.get<string>(
              'AI_RETRIEVAL_RERANKER_ENDPOINT',
              DEFAULT_AI_CONFIG.retrievalRerankerEndpoint,
            ) ?? DEFAULT_AI_CONFIG.retrievalRerankerEndpoint,
          retrievalRerankerMaxCandidates: Number(
            configService.get<number>(
              'AI_RETRIEVAL_RERANKER_MAX_CANDIDATES',
              DEFAULT_AI_CONFIG.retrievalRerankerMaxCandidates,
            ),
          ),
          retrievalRerankerTimeoutMs: Number(
            configService.get<number>(
              'AI_RETRIEVAL_RERANKER_TIMEOUT_MS',
              DEFAULT_AI_CONFIG.retrievalRerankerTimeoutMs,
            ),
          ),
          retrievalRerankerMaxConcurrent: Number(
            configService.get<number>(
              'AI_RETRIEVAL_RERANKER_MAX_CONCURRENT',
              DEFAULT_AI_CONFIG.retrievalRerankerMaxConcurrent,
            ),
          ),
          retrievalRerankerFailureThreshold: Number(
            configService.get<number>(
              'AI_RETRIEVAL_RERANKER_FAILURE_THRESHOLD',
              DEFAULT_AI_CONFIG.retrievalRerankerFailureThreshold,
            ),
          ),
          retrievalRerankerRecoveryIntervalMs: Number(
            configService.get<number>(
              'AI_RETRIEVAL_RERANKER_RECOVERY_INTERVAL_MS',
              DEFAULT_AI_CONFIG.retrievalRerankerRecoveryIntervalMs,
            ),
          ),
          // Conversation History Defaults
          chatMaxHistoryTurns: Number(
            configService.get<number>(
              'AI_CHAT_MAX_HISTORY_TURNS',
              DEFAULT_AI_CONFIG.chatMaxHistoryTurns,
            ),
          ),
          chatMaxHistoryTokens: Number(
            configService.get<number>(
              'AI_CHAT_MAX_HISTORY_TOKENS',
              DEFAULT_AI_CONFIG.chatMaxHistoryTokens,
            ),
          ),
          conversationTtlHours: Number(
            configService.get<number>(
              'AI_CONVERSATION_TTL_HOURS',
              DEFAULT_AI_CONFIG.conversationTtlHours,
            ),
          ),
          // Resilient Generation & Pipeline Timeouts
          retrievalTimeoutMs: Number(
            configService.get<number>(
              'AI_RETRIEVAL_TIMEOUT_MS',
              DEFAULT_AI_CONFIG.retrievalTimeoutMs,
            ),
          ),
          contextBuilderTimeoutMs: Number(
            configService.get<number>(
              'AI_CONTEXT_BUILDER_TIMEOUT_MS',
              DEFAULT_AI_CONFIG.contextBuilderTimeoutMs,
            ),
          ),
          generationTimeoutMs: Number(
            configService.get<number>(
              'AI_GENERATION_TIMEOUT_MS',
              DEFAULT_AI_CONFIG.generationTimeoutMs,
            ),
          ),
          generationMaxRetries: Number(
            configService.get<number>(
              'AI_GENERATION_MAX_RETRIES',
              DEFAULT_AI_CONFIG.generationMaxRetries,
            ),
          ),
          generationRetryBaseDelayMs: Number(
            configService.get<number>(
              'AI_GENERATION_RETRY_BASE_DELAY_MS',
              DEFAULT_AI_CONFIG.generationRetryBaseDelayMs,
            ),
          ),
          generationRetryMaxDelayMs: Number(
            configService.get<number>(
              'AI_GENERATION_RETRY_MAX_DELAY_MS',
              DEFAULT_AI_CONFIG.generationRetryMaxDelayMs,
            ),
          ),
          // Aliases
          llmModel,
          timeoutMs: requestTimeoutMs,
          maxParallelGeneration: chatMaxConcurrent,
        };
      },
      inject: [ConfigService],
    };

    const llmProvider = {
      provide: AI_LLM_PROVIDER_TOKEN,
      useFactory: (aiConfig: AiConfiguration) => {
        if (!aiConfig.enabled || options.useMocks || aiConfig.llmProvider === 'mock') {
          return new MockLLMAdapter();
        }
        return new OllamaLLMAdapter(aiConfig);
      },
      inject: [AI_CONFIG_TOKEN],
    };

    const embeddingProvider = {
      provide: AI_EMBEDDING_PROVIDER_TOKEN,
      useFactory: (aiConfig: AiConfiguration) => {
        if (!aiConfig.enabled || options.useMocks || aiConfig.embeddingProvider === 'mock') {
          return new MockEmbeddingAdapter();
        }
        return new OllamaEmbeddingAdapter(aiConfig);
      },
      inject: [AI_CONFIG_TOKEN],
    };

    const knowledgeDocRepoProvider = {
      provide: KNOWLEDGE_DOCUMENT_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaKnowledgeDocumentRepository(prisma),
      inject: [PrismaService],
    };

    const knowledgeDocRepoAlias = {
      provide: KNOWLEDGE_DOCUMENT_REPOSITORY_PORT,
      useExisting: KNOWLEDGE_DOCUMENT_REPOSITORY,
    };

    const ingestionJobRepoProvider = {
      provide: INGESTION_JOB_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaIngestionJobRepository(prisma),
      inject: [PrismaService],
    };

    const contentValidatorProvider = {
      provide: DOCUMENT_CONTENT_VALIDATOR,
      useClass: DocumentContentValidatorService,
    };

    const uploadServiceProvider = {
      provide: SECURE_DOCUMENT_UPLOAD_SERVICE,
      useClass: SecureDocumentUploadService,
    };

    const indexingPortProvider = {
      provide: DOCUMENT_INDEXING_PORT,
      useClass: VectorIndexingOrchestratorService,
    };

    const indexGenRepoProvider = {
      provide: INDEX_GENERATION_REPOSITORY_PORT,
      useFactory: (prisma: PrismaService) => new PrismaIndexGenerationRepository(prisma),
      inject: [PrismaService],
    };

    const indexGenRepoAlias = {
      provide: INDEX_GENERATION_REPOSITORY,
      useExisting: INDEX_GENERATION_REPOSITORY_PORT,
    };

    const vectorStoreRepoProvider = {
      provide: VECTOR_STORE_PORT,
      useFactory: (prisma: PrismaService) => new PrismaVectorStoreRepository(prisma),
      inject: [PrismaService],
    };

    const vectorStoreRepoAlias = {
      provide: VECTOR_STORE_REPOSITORY,
      useExisting: VECTOR_STORE_PORT,
    };

    const vectorJobRepoProvider = {
      provide: VECTOR_INDEXING_JOB_REPOSITORY_PORT,
      useFactory: (prisma: PrismaService) => new PrismaVectorIndexingJobRepository(prisma),
      inject: [PrismaService],
    };

    const vectorJobRepoAlias = {
      provide: VECTOR_INDEXING_JOB_REPOSITORY,
      useExisting: VECTOR_INDEXING_JOB_REPOSITORY_PORT,
    };

    const semanticRetrievalRepoProvider = {
      provide: SEMANTIC_RETRIEVAL_PORT,
      useFactory: (prisma: PrismaService) => new PrismaSemanticRetrievalRepository(prisma),
      inject: [PrismaService],
    };

    const semanticRetrievalRepoAlias = {
      provide: SEMANTIC_RETRIEVAL_REPOSITORY,
      useExisting: SEMANTIC_RETRIEVAL_PORT,
    };

    const lexicalRetrievalRepoProvider = {
      provide: LEXICAL_RETRIEVAL_PORT,
      useFactory: (prisma: PrismaService) => new PrismaLexicalRetrievalRepository(prisma),
      inject: [PrismaService],
    };

    const lexicalRetrievalRepoAlias = {
      provide: LEXICAL_RETRIEVAL_REPOSITORY,
      useExisting: LEXICAL_RETRIEVAL_PORT,
    };

    const vectorOrchestratorProvider = {
      provide: VECTOR_INDEXING_ORCHESTRATOR_SERVICE,
      useClass: VectorIndexingOrchestratorService,
    };

    const completenessValidatorProvider = {
      provide: INDEX_GENERATION_COMPLETENESS_VALIDATOR,
      useClass: IndexGenerationCompletenessValidatorService,
    };

    const vectorRecoveryWorkerProvider = {
      provide: VECTOR_INDEXING_RECOVERY_WORKER,
      useClass: VectorIndexingRecoveryWorker,
    };

    const modelChangeDetectorProvider = {
      provide: MODEL_CHANGE_DETECTOR_SERVICE,
      useClass: ModelChangeDetectorService,
    };

    const vectorCleanupProvider = {
      provide: VECTOR_CLEANUP_SERVICE,
      useClass: VectorCleanupService,
    };

    const indexReindexingProvider = {
      provide: INDEX_REINDEXING_SERVICE,
      useClass: IndexReindexingService,
    };

    const queryEmbeddingProvider = {
      provide: QUERY_EMBEDDING_USE_CASE_PORT,
      useClass: QueryEmbeddingService,
    };

    const queryEmbeddingAlias = {
      provide: QUERY_EMBEDDING_SERVICE,
      useExisting: QUERY_EMBEDDING_USE_CASE_PORT,
    };

    const securityPolicyProvider = {
      provide: RETRIEVAL_SECURITY_POLICY_SERVICE,
      useClass: RetrievalSecurityPolicyService,
    };

    const semanticSearchUseCaseProvider = {
      provide: SEMANTIC_SEARCH_USE_CASE_PORT,
      useClass: SecureSemanticSearchService,
    };

    const semanticSearchUseCaseAlias = {
      provide: SEMANTIC_SEARCH_USE_CASE,
      useExisting: SEMANTIC_SEARCH_USE_CASE_PORT,
    };

    const crossEncoderRerankingProvider = {
      provide: CROSS_ENCODER_RERANKING_PORT,
      useFactory: (aiConfig: AiConfiguration) => {
        return new LocalCrossEncoderRerankingAdapter(aiConfig);
      },
      inject: [AI_CONFIG_TOKEN],
    };

    const crossEncoderRerankingAlias = {
      provide: CROSS_ENCODER_RERANKING_SERVICE,
      useExisting: CROSS_ENCODER_RERANKING_PORT,
    };

    const ragContextBuilderProvider = {
      provide: RAG_CONTEXT_BUILDER_PORT,
      useClass: RAGContextBuilderService,
    };

    const ragContextBuilderAlias = {
      provide: RAG_CONTEXT_BUILDER_SERVICE,
      useExisting: RAG_CONTEXT_BUILDER_PORT,
    };

    const groundedGenerationProvider = {
      provide: GROUNDED_GENERATION_PORT,
      useClass: GroundedGenerationService,
    };

    const groundedGenerationAlias = {
      provide: GROUNDED_GENERATION_SERVICE,
      useExisting: GROUNDED_GENERATION_PORT,
    };

    const citationValidatorProvider = {
      provide: CITATION_VALIDATOR_PORT,
      useClass: CitationValidatorService,
    };

    const citationValidatorAlias = {
      provide: CITATION_VALIDATOR_SERVICE,
      useExisting: CITATION_VALIDATOR_PORT,
    };

    const conversationRepositoryProvider = {
      provide: CONVERSATION_REPOSITORY_PORT,
      useFactory: (aiConfig: AiConfiguration) =>
        new InMemoryConversationRepositoryAdapter(aiConfig?.conversationTtlHours ?? 24),
      inject: [AI_CONFIG_TOKEN],
    };

    const conversationRepositoryAlias = {
      provide: CONVERSATION_REPOSITORY,
      useExisting: CONVERSATION_REPOSITORY_PORT,
    };

    const conversationRepositoryClass = {
      provide: InMemoryConversationRepositoryAdapter,
      useExisting: CONVERSATION_REPOSITORY_PORT,
    };

    const conversationHistoryManagerProvider = {
      provide: CONVERSATION_HISTORY_MANAGER_PORT,
      useClass: ConversationHistoryManagerService,
    };

    const conversationHistoryManagerAlias = {
      provide: CONVERSATION_HISTORY_MANAGER_SERVICE,
      useExisting: CONVERSATION_HISTORY_MANAGER_PORT,
    };

    const generationObservabilityProvider = {
      provide: GENERATION_OBSERVABILITY_SERVICE,
      useClass: GenerationObservabilityService,
    };

    const ragOrchestratorProvider = {
      provide: GENERATE_GROUNDED_ANSWER_USE_CASE_PORT,
      useClass: RAGOrchestratorService,
    };

    const ragOrchestratorAlias = {
      provide: GENERATE_GROUNDED_ANSWER_USE_CASE,
      useExisting: GENERATE_GROUNDED_ANSWER_USE_CASE_PORT,
    };

    const ragTurnPipelineProvider = {
      provide: RAG_TURN_PIPELINE_PORT,
      useClass: RAGTurnPipelineAdapter,
    };

    const ragTurnPipelineAlias = {
      provide: RAG_TURN_PIPELINE_SERVICE,
      useExisting: RAG_TURN_PIPELINE_PORT,
    };

    const executeConversationTurnProvider = {
      provide: ExecuteConversationTurnUseCase,
      useFactory: (
        convRepo: IAiConversationRepositoryPort,
        turnRepo: IAiConversationTurnRepositoryPort,
        msgRepo: IAiConversationMessageRepositoryPort,
        persistMessageStateUseCase: PersistMessageStateUseCase,
        ragPipeline: IRAGTurnPipelinePort,
        historyLoader: LoadCanonicalConversationHistoryUseCase,
        txRunner: IAiConversationTransactionRunner,
        citationRepo?: IAiConversationCitationRepositoryPort,
      ) =>
        new ExecuteConversationTurnUseCase(
          convRepo,
          turnRepo,
          msgRepo,
          persistMessageStateUseCase,
          ragPipeline,
          historyLoader,
          txRunner,
          citationRepo,
        ),
      inject: [
        AI_CONVERSATION_REPOSITORY_PORT,
        AI_CONVERSATION_TURN_REPOSITORY_PORT,
        AI_CONVERSATION_MESSAGE_REPOSITORY_PORT,
        PersistMessageStateUseCase,
        RAG_TURN_PIPELINE_PORT,
        LoadCanonicalConversationHistoryUseCase,
        AI_CONVERSATION_TRANSACTION_RUNNER,
        { token: AI_CONVERSATION_CITATION_REPOSITORY_PORT, optional: true },
      ],
    };

    const turnDispatcherProvider = {
      provide: AiTurnDispatcherService,
      useClass: AiTurnDispatcherService,
    };

    const turnDispatcherAlias = {
      provide: AI_TURN_DISPATCHER_PORT,
      useExisting: AiTurnDispatcherService,
    };

    const turnDispatcherServiceAlias = {
      provide: AI_TURN_DISPATCHER_SERVICE,
      useExisting: AiTurnDispatcherService,
    };

    const turnGenerationWorkerProvider = {
      provide: AiTurnGenerationWorker,
      useClass: AiTurnGenerationWorker,
    };

    const turnGenerationWorkerAlias = {
      provide: AI_TURN_GENERATION_WORKER,
      useExisting: AiTurnGenerationWorker,
    };

    const orchestratorProvider = {
      provide: INGESTION_ORCHESTRATOR_SERVICE,
      useClass: IngestionOrchestratorService,
    };

    const recoveryWorkerProvider = {
      provide: INGESTION_RECOVERY_WORKER,
      useClass: IngestionRecoveryWorker,
    };

    const documentParserProvider = {
      provide: DOCUMENT_PARSER_TOKEN,
      useClass: CompositeDocumentParserAdapter,
    };

    const languageDetectorProvider = {
      provide: LANGUAGE_DETECTOR_TOKEN,
      useClass: DeterministicLanguageDetectorService,
    };

    const documentNormalizerProvider = {
      provide: DOCUMENT_NORMALIZER_TOKEN,
      useClass: DeterministicDocumentNormalizerService,
    };

    const tokenizerProvider = {
      provide: TOKENIZER_TOKEN,
      useClass: DeterministicBpeTokenizerAdapter,
    };

    const documentChunkerProvider = {
      provide: DOCUMENT_CHUNKER_TOKEN,
      useClass: StructureAwareChunkerService,
    };

    const knowledgeChunkRepoProvider = {
      provide: KNOWLEDGE_CHUNK_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaKnowledgeChunkRepository(prisma),
      inject: [PrismaService],
    };

    const processingPipelineProvider = {
      provide: DOCUMENT_PROCESSING_PIPELINE_SERVICE,
      useClass: DocumentProcessingPipelineService,
    };

    const embeddingPipelineProvider = {
      provide: EMBEDDING_GENERATION_PIPELINE_SERVICE,
      useClass: EmbeddingGenerationPipelineService,
    };

    return {
      module: AiModule,
      imports: [PrismaModule, StorageModule.register(), IdentityModule, AiConversationModule],
      controllers: [AiHealthController, AiDocumentController, AiRAGController],
      providers: [
        configProvider,
        llmProvider,
        embeddingProvider,
        AiHealthService,
        knowledgeDocRepoProvider,
        knowledgeDocRepoAlias,
        ingestionJobRepoProvider,
        contentValidatorProvider,
        DocumentContentValidatorService,
        uploadServiceProvider,
        SecureDocumentUploadService,
        indexingPortProvider,
        PendingDocumentIndexingAdapter,
        orchestratorProvider,
        IngestionOrchestratorService,
        recoveryWorkerProvider,
        IngestionRecoveryWorker,
        PdfParserAdapter,
        DocxParserAdapter,
        MarkdownParserAdapter,
        PlainTextParserAdapter,
        CompositeDocumentParserAdapter,
        documentParserProvider,
        DeterministicLanguageDetectorService,
        languageDetectorProvider,
        DeterministicDocumentNormalizerService,
        documentNormalizerProvider,
        DeterministicBpeTokenizerAdapter,
        tokenizerProvider,
        StructureAwareChunkerService,
        documentChunkerProvider,
        knowledgeChunkRepoProvider,
        processingPipelineProvider,
        DocumentProcessingPipelineService,
        embeddingPipelineProvider,
        EmbeddingGenerationPipelineService,
        indexGenRepoProvider,
        indexGenRepoAlias,
        vectorStoreRepoProvider,
        vectorStoreRepoAlias,
        vectorJobRepoProvider,
        vectorJobRepoAlias,
        vectorOrchestratorProvider,
        VectorIndexingOrchestratorService,
        completenessValidatorProvider,
        IndexGenerationCompletenessValidatorService,
        vectorRecoveryWorkerProvider,
        VectorIndexingRecoveryWorker,
        modelChangeDetectorProvider,
        ModelChangeDetectorService,
        vectorCleanupProvider,
        VectorCleanupService,
        indexReindexingProvider,
        IndexReindexingService,
        queryEmbeddingProvider,
        queryEmbeddingAlias,
        QueryEmbeddingService,
        semanticRetrievalRepoProvider,
        semanticRetrievalRepoAlias,
        lexicalRetrievalRepoProvider,
        lexicalRetrievalRepoAlias,
        securityPolicyProvider,
        RetrievalSecurityPolicyService,
        semanticSearchUseCaseProvider,
        semanticSearchUseCaseAlias,
        SecureSemanticSearchService,
        crossEncoderRerankingProvider,
        crossEncoderRerankingAlias,
        LocalCrossEncoderRerankingAdapter,
        ragContextBuilderProvider,
        ragContextBuilderAlias,
        RAGContextBuilderService,
        groundedGenerationProvider,
        groundedGenerationAlias,
        GroundedGenerationService,
        citationValidatorProvider,
        citationValidatorAlias,
        CitationValidatorService,
        conversationRepositoryProvider,
        conversationRepositoryAlias,
        conversationRepositoryClass,
        conversationHistoryManagerProvider,
        conversationHistoryManagerAlias,
        ConversationHistoryManagerService,
        generationObservabilityProvider,
        GenerationObservabilityService,
        ragOrchestratorProvider,
        ragOrchestratorAlias,
        RAGOrchestratorService,
        ragTurnPipelineProvider,
        ragTurnPipelineAlias,
        RAGTurnPipelineAdapter,
        executeConversationTurnProvider,
        turnDispatcherProvider,
        turnDispatcherAlias,
        turnDispatcherServiceAlias,
        AiTurnDispatcherService,
        turnGenerationWorkerProvider,
        turnGenerationWorkerAlias,
        AiTurnGenerationWorker,
        RetrievalObservabilityService,
      ],
      exports: [
        AI_CONFIG_TOKEN,
        AI_LLM_PROVIDER_TOKEN,
        AI_EMBEDDING_PROVIDER_TOKEN,
        AiHealthService,
        KNOWLEDGE_DOCUMENT_REPOSITORY,
        KNOWLEDGE_DOCUMENT_REPOSITORY_PORT,
        INGESTION_JOB_REPOSITORY,
        DOCUMENT_CONTENT_VALIDATOR,
        SECURE_DOCUMENT_UPLOAD_SERVICE,
        SecureDocumentUploadService,
        DocumentContentValidatorService,
        DOCUMENT_INDEXING_PORT,
        PendingDocumentIndexingAdapter,
        INGESTION_ORCHESTRATOR_SERVICE,
        IngestionOrchestratorService,
        INGESTION_RECOVERY_WORKER,
        IngestionRecoveryWorker,
        DOCUMENT_PARSER_TOKEN,
        CompositeDocumentParserAdapter,
        LANGUAGE_DETECTOR_TOKEN,
        DeterministicLanguageDetectorService,
        DOCUMENT_NORMALIZER_TOKEN,
        DeterministicDocumentNormalizerService,
        TOKENIZER_TOKEN,
        DeterministicBpeTokenizerAdapter,
        DOCUMENT_CHUNKER_TOKEN,
        StructureAwareChunkerService,
        KNOWLEDGE_CHUNK_REPOSITORY,
        DOCUMENT_PROCESSING_PIPELINE_SERVICE,
        DocumentProcessingPipelineService,
        EMBEDDING_GENERATION_PIPELINE_SERVICE,
        EmbeddingGenerationPipelineService,
        INDEX_GENERATION_REPOSITORY_PORT,
        INDEX_GENERATION_REPOSITORY,
        VECTOR_STORE_PORT,
        VECTOR_STORE_REPOSITORY,
        VECTOR_INDEXING_JOB_REPOSITORY_PORT,
        VECTOR_INDEXING_JOB_REPOSITORY,
        VECTOR_INDEXING_ORCHESTRATOR_SERVICE,
        VectorIndexingOrchestratorService,
        INDEX_GENERATION_COMPLETENESS_VALIDATOR,
        IndexGenerationCompletenessValidatorService,
        VECTOR_INDEXING_RECOVERY_WORKER,
        VectorIndexingRecoveryWorker,
        MODEL_CHANGE_DETECTOR_SERVICE,
        ModelChangeDetectorService,
        VECTOR_CLEANUP_SERVICE,
        VectorCleanupService,
        INDEX_REINDEXING_SERVICE,
        IndexReindexingService,
        QUERY_EMBEDDING_USE_CASE_PORT,
        QUERY_EMBEDDING_SERVICE,
        QueryEmbeddingService,
        SEMANTIC_RETRIEVAL_PORT,
        SEMANTIC_RETRIEVAL_REPOSITORY,
        LEXICAL_RETRIEVAL_PORT,
        LEXICAL_RETRIEVAL_REPOSITORY,
        RETRIEVAL_SECURITY_POLICY_SERVICE,
        RetrievalSecurityPolicyService,
        SEMANTIC_SEARCH_USE_CASE_PORT,
        SEMANTIC_SEARCH_USE_CASE,
        SecureSemanticSearchService,
        CROSS_ENCODER_RERANKING_PORT,
        CROSS_ENCODER_RERANKING_SERVICE,
        LocalCrossEncoderRerankingAdapter,
        RAG_CONTEXT_BUILDER_PORT,
        RAG_CONTEXT_BUILDER_SERVICE,
        RAGContextBuilderService,
        GROUNDED_GENERATION_PORT,
        GROUNDED_GENERATION_SERVICE,
        GroundedGenerationService,
        CITATION_VALIDATOR_PORT,
        CITATION_VALIDATOR_SERVICE,
        CitationValidatorService,
        CONVERSATION_REPOSITORY_PORT,
        CONVERSATION_REPOSITORY,
        InMemoryConversationRepositoryAdapter,
        CONVERSATION_HISTORY_MANAGER_PORT,
        CONVERSATION_HISTORY_MANAGER_SERVICE,
        ConversationHistoryManagerService,
        GENERATION_OBSERVABILITY_SERVICE,
        GenerationObservabilityService,
        GENERATE_GROUNDED_ANSWER_USE_CASE_PORT,
        GENERATE_GROUNDED_ANSWER_USE_CASE,
        RAGOrchestratorService,
        RAG_TURN_PIPELINE_PORT,
        RAG_TURN_PIPELINE_SERVICE,
        RAGTurnPipelineAdapter,
        ExecuteConversationTurnUseCase,
        AI_TURN_DISPATCHER_PORT,
        AI_TURN_DISPATCHER_SERVICE,
        AiTurnDispatcherService,
        AI_TURN_GENERATION_WORKER,
        AiTurnGenerationWorker,
        RetrievalObservabilityService,
        AiConversationModule,
      ],
    };
  }
}
