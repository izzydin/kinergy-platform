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
  // Aliases
  llmModel: 'qwen3:4b',
  timeoutMs: 30000,
  maxParallelGeneration: 1,
};
