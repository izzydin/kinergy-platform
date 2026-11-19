import {
  LLMProviderUnavailableException,
  GenerationFailedException,
  GenerationCancelledException,
  ModelNotFoundException,
  ProviderTimeoutException,
} from '@kinergy-platform/core';
import { OllamaLLMAdapter } from '../ollama-llm.adapter';

describe('OllamaLLMAdapter Contract & Resilience Tests', () => {
  let adapter: OllamaLLMAdapter;
  const originalFetch = global.fetch;

  beforeEach(() => {
    adapter = new OllamaLLMAdapter({
      ollamaBaseUrl: 'http://mock-ollama:11434',
      llmModel: 'qwen3:4b',
      timeoutMs: 1000,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('should return the configured model identifier', () => {
    expect(adapter.getModelIdentifier()).toBe('qwen3:4b');
  });

  describe('checkHealth', () => {
    it('should return isHealthy: true when model exists in tags', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [{ name: 'qwen3:4b', model: 'qwen3:4b', size: 2500000000 }],
        }),
      } as unknown as Response);

      const health = await adapter.checkHealth();
      expect(health.isHealthy).toBe(true);
      expect(health.model).toBe('qwen3:4b');
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should return isHealthy: false when model is missing from tags', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [{ name: 'other-model:latest', model: 'other-model' }],
        }),
      } as unknown as Response);

      const health = await adapter.checkHealth();
      expect(health.isHealthy).toBe(false);
    });

    it('should return isHealthy: false without throwing when service is unreachable', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Connection refused'));

      const health = await adapter.checkHealth();
      expect(health.isHealthy).toBe(false);
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('generateText', () => {
    it('should return generation result on successful Ollama response', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          response: 'Kinergy is an enterprise kinesiology platform.',
          prompt_eval_count: 10,
          eval_count: 15,
          done: true,
        }),
      } as unknown as Response);

      const result = await adapter.generateText('What is Kinergy?');
      expect(result.text).toBe('Kinergy is an enterprise kinesiology platform.');
      expect(result.promptTokens).toBe(10);
      expect(result.completionTokens).toBe(15);
      expect(result.modelIdentifier).toBe('qwen3:4b');
      expect(result.finishReason).toBe('stop');
    });

    it('should pass format: json in body when structured output is requested', async () => {
      let capturedBody: string | undefined;
      global.fetch = jest.fn().mockImplementation((_url, init) => {
        capturedBody = init.body;
        return Promise.resolve({
          ok: true,
          json: async () => ({
            response: '{"severity":"LOW"}',
            prompt_eval_count: 5,
            eval_count: 8,
            done: true,
          }),
        } as unknown as Response);
      });

      const result = await adapter.generateText('Analyze issue', { format: 'json' });
      expect(result.text).toBe('{"severity":"LOW"}');
      expect(capturedBody).toBeDefined();
      const parsedBody = JSON.parse(capturedBody!);
      expect(parsedBody.format).toBe('json');
    });

    it('should throw ModelNotFoundException when Ollama returns HTTP 404', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
      } as unknown as Response);

      await expect(adapter.generateText('test')).rejects.toThrow(ModelNotFoundException);
    });

    it('should throw GenerationFailedException when Ollama returns non-200 HTTP status', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
      } as unknown as Response);

      await expect(adapter.generateText('test')).rejects.toThrow(GenerationFailedException);
    });

    it('should throw GenerationCancelledException when AbortSignal is cancelled', async () => {
      const abortController = new AbortController();
      abortController.abort();

      await expect(
        adapter.generateText('test', { signal: abortController.signal }),
      ).rejects.toThrow(GenerationCancelledException);
    });

    it('should throw ProviderTimeoutException when request times out', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      global.fetch = jest.fn().mockRejectedValue(abortError);

      await expect(adapter.generateText('test')).rejects.toThrow(ProviderTimeoutException);
    });

    it('should trip the circuit breaker after consecutive failures and fast-fail', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network offline'));

      // 3 consecutive failures trip the breaker
      for (let i = 0; i < 3; i++) {
        await expect(adapter.generateText('test')).rejects.toThrow(LLMProviderUnavailableException);
      }

      // 4th call should immediately fast-fail via circuit breaker
      const start = Date.now();
      await expect(adapter.generateText('test')).rejects.toThrow(/Circuit breaker is open/);
      expect(Date.now() - start).toBeLessThan(10); // Fast fail < 10ms
    });
  });

  describe('generateStream', () => {
    it('should stream text chunks sequentially', async () => {
      const encoder = new TextEncoder();
      const streamChunks = [
        encoder.encode(JSON.stringify({ response: 'Hello' }) + '\n'),
        encoder.encode(JSON.stringify({ response: ' World' }) + '\n'),
      ];

      let chunkIndex = 0;
      const mockReader = {
        read: jest.fn().mockImplementation(async () => {
          if (chunkIndex < streamChunks.length) {
            return { done: false, value: streamChunks[chunkIndex++] };
          }
          return { done: true, value: undefined };
        }),
        releaseLock: jest.fn(),
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => mockReader,
        },
      } as unknown as Response);

      const collected: string[] = [];
      for await (const chunk of adapter.generateStream('Greet me')) {
        collected.push(chunk);
      }

      expect(collected).toEqual(['Hello', ' World']);
      expect(mockReader.releaseLock).toHaveBeenCalled();
    });
  });
});
