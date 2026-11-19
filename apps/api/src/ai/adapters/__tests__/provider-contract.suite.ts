import { ILLMProviderPort, IEmbeddingProviderPort } from '@kinergy-platform/core';

export function runLLMProviderContractTests(
  providerName: string,
  createProvider: () => ILLMProviderPort,
): void {
  describe(`Contract Test Suite: ${providerName} (ILLMProviderPort)`, () => {
    let provider: ILLMProviderPort;

    beforeEach(() => {
      provider = createProvider();
    });

    it('should implement getModelIdentifier returning non-empty string', () => {
      const id = provider.getModelIdentifier();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('should implement checkHealth returning boolean health and latency', async () => {
      const health = await provider.checkHealth();
      expect(health).toHaveProperty('isHealthy');
      expect(typeof health.isHealthy).toBe('boolean');
      expect(health).toHaveProperty('model');
      expect(health).toHaveProperty('latencyMs');
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should implement generateText satisfying LLMGenerationResult schema', async () => {
      const result = await provider.generateText('Ping test', { maxTokens: 20 });
      expect(result).toHaveProperty('text');
      expect(typeof result.text).toBe('string');
      expect(result).toHaveProperty('promptTokens');
      expect(typeof result.promptTokens).toBe('number');
      expect(result).toHaveProperty('completionTokens');
      expect(typeof result.completionTokens).toBe('number');
      expect(result).toHaveProperty('modelIdentifier');
      expect(result).toHaveProperty('finishReason');
      expect(['stop', 'length', 'cancelled']).toContain(result.finishReason);
    });

    it('should implement generateStream yielding string tokens', async () => {
      const tokens: string[] = [];
      for await (const token of provider.generateStream('Stream ping', { maxTokens: 10 })) {
        tokens.push(token);
      }
      expect(Array.isArray(tokens)).toBe(true);
    });
  });
}

export function runEmbeddingProviderContractTests(
  providerName: string,
  createProvider: () => IEmbeddingProviderPort,
): void {
  describe(`Contract Test Suite: ${providerName} (IEmbeddingProviderPort)`, () => {
    let provider: IEmbeddingProviderPort;

    beforeEach(() => {
      provider = createProvider();
    });

    it('should implement getDimensions returning strictly positive integer', () => {
      const dims = provider.getDimensions();
      expect(typeof dims).toBe('number');
      expect(dims).toBe(1024);
    });

    it('should implement getModelIdentifier returning model string', () => {
      const id = provider.getModelIdentifier();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('should implement generateEmbedding returning array with exact dimensions', async () => {
      const vector = await provider.generateEmbedding('Biomechanical assessment');
      expect(Array.isArray(vector)).toBe(true);
      expect(vector).toHaveLength(provider.getDimensions());
      expect(typeof vector[0]).toBe('number');
      expect(Number.isFinite(vector[0])).toBe(true);
    });

    it('should implement generateBatchEmbeddings returning array of vector arrays', async () => {
      const batch = await provider.generateBatchEmbeddings(['Chunk 1', 'Chunk 2']);
      expect(Array.isArray(batch)).toBe(true);
      expect(batch).toHaveLength(2);
      expect(batch[0]).toHaveLength(provider.getDimensions());
      expect(batch[1]).toHaveLength(provider.getDimensions());
    });
  });
}
