export interface LLMGenerationOptions {
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  systemPrompt?: string;
  signal?: AbortSignal;
  format?: 'json';
}

export interface LLMGenerationResult {
  text: string;
  promptTokens: number;
  completionTokens: number;
  modelIdentifier: string;
  finishReason: 'stop' | 'length' | 'cancelled';
}

export interface ILLMProviderPort {
  generateText(prompt: string, options?: LLMGenerationOptions): Promise<LLMGenerationResult>;
  generateStream(prompt: string, options?: LLMGenerationOptions): AsyncIterable<string>;
  getModelIdentifier(): string;
  checkHealth(): Promise<{ isHealthy: boolean; model: string; latencyMs: number }>;
}
