export interface EmbeddingOptions {
  signal?: AbortSignal;
}

export interface IEmbeddingProviderPort {
  generateEmbedding(text: string, options?: EmbeddingOptions): Promise<number[]>;
  generateBatchEmbeddings(texts: string[], options?: EmbeddingOptions): Promise<number[][]>;
  getDimensions(): number; // Strictly returns 1024 for BGE-M3
  getModelIdentifier(): string;
  checkHealth?(): Promise<{ isHealthy: boolean; model: string; latencyMs: number }>;
}
