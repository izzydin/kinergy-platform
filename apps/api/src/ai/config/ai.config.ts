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
  // Aliases
  llmModel: 'qwen3:4b',
  timeoutMs: 30000,
  maxParallelGeneration: 1,
};
