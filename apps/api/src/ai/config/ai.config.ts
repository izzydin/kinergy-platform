export interface AiConfiguration {
  enabled: boolean;
  llmProvider: 'mock' | 'ollama';
  embeddingProvider: 'mock' | 'ollama';
  ollamaBaseUrl: string;
  requestTimeoutMs: number;
  healthTimeoutMs: number;
  chatModel: string;
  chatTemperature: number;
  chatMaxTokens: number;
  chatContextWindow: number;
  chatMaxConcurrent: number;
  embeddingModel: string;
  embeddingDimensions: number;
  embeddingBatchSize: number;
  embeddingMaxConcurrent: number;
  healthCheckEnabled: boolean;
  startupCheckEnabled: boolean;
  failureThreshold: number;
  maxDocumentSizeBytes: number;
  allowedDocumentMimeTypes: string[];
  // Chunking Configuration
  targetChunkTokens: number;
  minimumChunkTokens: number;
  maximumChunkTokens: number;
  overlapTokens: number;
  chunkingStrategy: string;
  // Retrieval & Scoring Configuration
  retrievalDefaultTopK: number;
  retrievalMaxTopK: number;
  retrievalSimilarityThreshold: number;
  retrievalEvaluationProfile: string;
  // Hybrid Search & Fusion Configuration
  retrievalSearchMode: 'SEMANTIC' | 'KEYWORD' | 'HYBRID';
  retrievalSemanticCandidateLimit: number;
  retrievalKeywordCandidateLimit: number;
  retrievalRrfConstant: number;
  // Cross-Encoder Reranking Configuration
  retrievalRerankerEnabled: boolean;
  retrievalRerankerModel: string;
  retrievalRerankerProvider: 'mock' | 'tei' | 'http';
  retrievalRerankerEndpoint: string;
  retrievalRerankerMaxCandidates: number;
  retrievalRerankerTimeoutMs: number;
  retrievalRerankerMaxConcurrent: number;
  retrievalRerankerFailureThreshold: number;
  retrievalRerankerRecoveryIntervalMs: number;
  // Conversation History Defaults
  chatMaxHistoryTurns: number;
  chatMaxHistoryTokens: number;
  conversationTtlHours: number;
  // Resilient Generation & Pipeline Timeouts
  retrievalTimeoutMs: number;
  contextBuilderTimeoutMs: number;
  generationTimeoutMs: number;
  generationMaxRetries: number;
  generationRetryBaseDelayMs: number;
  generationRetryMaxDelayMs: number;
  // Aliases for backwards compatibility
  llmModel: string;
  timeoutMs: number;
  maxParallelGeneration: number;
}

export const DEFAULT_AI_CONFIG: AiConfiguration = {
  enabled: false,
  llmProvider: 'mock',
  embeddingProvider: 'mock',
  ollamaBaseUrl: 'http://127.0.0.1:11434',
  requestTimeoutMs: 30000,
  healthTimeoutMs: 3000,
  chatModel: 'qwen3:4b',
  chatTemperature: 0.2,
  chatMaxTokens: 512,
  chatContextWindow: 4096,
  chatMaxConcurrent: 1,
  embeddingModel: 'bge-m3:latest',
  embeddingDimensions: 1024,
  embeddingBatchSize: 16,
  embeddingMaxConcurrent: 2,
  healthCheckEnabled: true,
  startupCheckEnabled: false,
  failureThreshold: 3,
  maxDocumentSizeBytes: 10 * 1024 * 1024, // 10 MB
  allowedDocumentMimeTypes: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/markdown',
    'text/x-markdown',
    'text/plain',
  ],
  // Chunking Defaults
  targetChunkTokens: 450,
  minimumChunkTokens: 400,
  maximumChunkTokens: 500,
  overlapTokens: 60,
  chunkingStrategy: 'structure-aware',
  // Retrieval & Scoring Defaults
  retrievalDefaultTopK: 5,
  retrievalMaxTopK: 50,
  retrievalSimilarityThreshold: 0.6,
  retrievalEvaluationProfile: 'bge-m3-dense-v1',
  // Hybrid Search & Fusion Defaults
  retrievalSearchMode: 'SEMANTIC',
  retrievalSemanticCandidateLimit: 20,
  retrievalKeywordCandidateLimit: 20,
  retrievalRrfConstant: 60,
  // Cross-Encoder Reranking Defaults (Disabled by default)
  retrievalRerankerEnabled: false,
  retrievalRerankerModel: 'bge-reranker-m3',
  retrievalRerankerProvider: 'mock',
  retrievalRerankerEndpoint: 'http://127.0.0.1:8080',
  retrievalRerankerMaxCandidates: 20,
  retrievalRerankerTimeoutMs: 80,
  retrievalRerankerMaxConcurrent: 2,
  retrievalRerankerFailureThreshold: 3,
  retrievalRerankerRecoveryIntervalMs: 10000,
  // Conversation History Defaults
  chatMaxHistoryTurns: 10,
  chatMaxHistoryTokens: 500,
  conversationTtlHours: 24,
  // Resilient Generation & Pipeline Timeouts
  retrievalTimeoutMs: 5000,
  contextBuilderTimeoutMs: 1000,
  generationTimeoutMs: 20000,
  generationMaxRetries: 1,
  generationRetryBaseDelayMs: 200,
  generationRetryMaxDelayMs: 1000,
  // Aliases
  llmModel: 'qwen3:4b',
  timeoutMs: 30000,
  maxParallelGeneration: 1,
};
