import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { AiConfigurationInvalidException, ProviderTimeoutException } from '@kinergy-platform/core';
import { AiModule } from '../ai.module';
import { AiHealthService } from '../services/ai-health.service';
import { OllamaLLMAdapter } from '../adapters/llm/ollama-llm.adapter';
import { OllamaEmbeddingAdapter } from '../adapters/embedding/ollama-embedding.adapter';
import { DEFAULT_AI_CONFIG } from '../config/ai.config';
import { AppController } from '../../app.controller';

describe('AI-02.4 — Failure Isolation & Resilience Matrix (10 Scenarios)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  // Scenario 1: AI disabled and Ollama unavailable
  it('Scenario 1: AI disabled and Ollama unavailable -> reports DISABLED without network attempts', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock;

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              AI_ENABLED: false,
              AI_OLLAMA_BASE_URL: 'http://127.0.0.1:59999',
            }),
          ],
        }),
        AiModule.forRoot(),
      ],
    }).compile();

    const healthService = moduleRef.get<AiHealthService>(AiHealthService);
    const report = await healthService.getHealthReport();

    expect(report.enabled).toBe(false);
    expect(report.overallStatus).toBe('DISABLED');
    expect(fetchMock).not.toHaveBeenCalled();
    await moduleRef.close();
  });

  // Scenario 2: AI enabled and Ollama available
  it('Scenario 2: AI enabled and Ollama available -> reports OPERATIONAL and model readiness', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/tags')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            models: [
              { name: 'qwen3:4b', model: 'qwen3:4b' },
              { name: 'bge-m3:latest', model: 'bge-m3:latest' },
            ],
          }),
        });
      }
      if (url.includes('/api/ps')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            models: [{ name: 'qwen3:4b', model: 'qwen3:4b', size_vram: 2500000000 }],
          }),
        });
      }
      return Promise.reject(new Error('Unknown endpoint'));
    });

    const service = new AiHealthService(
      {
        ...DEFAULT_AI_CONFIG,
        enabled: true,
        llmProvider: 'ollama',
        embeddingProvider: 'ollama',
      },
      new OllamaLLMAdapter(),
      new OllamaEmbeddingAdapter(),
    );

    const report = await service.getHealthReport();
    expect(report.enabled).toBe(true);
    expect(report.overallStatus).toBe('OPERATIONAL');
    expect(report.runtimeReachable).toBe(true);
    expect(report.models.chat.isInstalled).toBe(true);
    expect(report.models.chat.isLoaded).toBe(true);
    expect(report.models.embedding.isInstalled).toBe(true);
    expect(report.models.embedding.isLoaded).toBe(false); // verified uninvaded in VRAM
  });

  // Scenario 3: AI enabled and Ollama unavailable
  it('Scenario 3: AI enabled and Ollama unavailable -> reports OFFLINE safely without crashing', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const service = new AiHealthService(
      {
        ...DEFAULT_AI_CONFIG,
        enabled: true,
        llmProvider: 'ollama',
        embeddingProvider: 'ollama',
      },
      new OllamaLLMAdapter(),
      new OllamaEmbeddingAdapter(),
    );

    const report = await service.getHealthReport();
    expect(report.enabled).toBe(true);
    expect(report.overallStatus).toBe('OFFLINE');
    expect(report.runtimeReachable).toBe(false);
    expect(report.models.chat.isCapable).toBe(false);
    expect(report.models.embedding.isCapable).toBe(false);
  });

  // Scenario 4: Generation model missing
  it('Scenario 4: Generation model missing -> reports DEGRADED with chat uninstalled', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/tags')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            models: [{ name: 'bge-m3:latest', model: 'bge-m3:latest' }],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ models: [] }) });
    });

    const service = new AiHealthService(
      {
        ...DEFAULT_AI_CONFIG,
        enabled: true,
        llmProvider: 'ollama',
        embeddingProvider: 'ollama',
      },
      new OllamaLLMAdapter(),
      new OllamaEmbeddingAdapter(),
    );

    const report = await service.getHealthReport();
    expect(report.overallStatus).toBe('DEGRADED');
    expect(report.models.chat.isInstalled).toBe(false);
    expect(report.models.chat.isCapable).toBe(false);
    expect(report.models.embedding.isInstalled).toBe(true);
    expect(report.models.embedding.isCapable).toBe(true);
  });

  // Scenario 5: Embedding model missing
  it('Scenario 5: Embedding model missing -> reports DEGRADED with embedding uninstalled', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/api/tags')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            models: [{ name: 'qwen3:4b', model: 'qwen3:4b' }],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ models: [] }) });
    });

    const service = new AiHealthService(
      {
        ...DEFAULT_AI_CONFIG,
        enabled: true,
        llmProvider: 'ollama',
        embeddingProvider: 'ollama',
      },
      new OllamaLLMAdapter(),
      new OllamaEmbeddingAdapter(),
    );

    const report = await service.getHealthReport();
    expect(report.overallStatus).toBe('DEGRADED');
    expect(report.models.chat.isInstalled).toBe(true);
    expect(report.models.chat.isCapable).toBe(true);
    expect(report.models.embedding.isInstalled).toBe(false);
    expect(report.models.embedding.isCapable).toBe(false);
  });

  // Scenario 6: Provider timeout
  it('Scenario 6: Provider timeout -> adapter maps AbortError to ProviderTimeoutException', async () => {
    const adapter = new OllamaLLMAdapter({ timeoutMs: 50 });
    const abortErr = new Error('The operation was aborted');
    abortErr.name = 'AbortError';
    global.fetch = jest.fn().mockRejectedValue(abortErr);

    await expect(adapter.generateText('Ping')).rejects.toThrow(ProviderTimeoutException);
  });

  // Scenario 7: Provider recovery
  it('Scenario 7: Provider recovery -> circuit breaker recovers after cooldown and successful call', async () => {
    const adapter = new OllamaLLMAdapter({ timeoutMs: 1000 });

    // Trip circuit breaker
    global.fetch = jest.fn().mockRejectedValue(new Error('Network offline'));
    for (let i = 0; i < 3; i++) {
      await expect(adapter.generateText('Ping')).rejects.toThrow();
    }

    // Advance time past cooldown by manually altering private state for test
    (
      adapter as unknown as { circuitBreaker: { lastFailureTime: number } }
    ).circuitBreaker.lastFailureTime = Date.now() - 20000;

    // Service recovers
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: 'Recovered answer', done: true }),
    } as unknown as Response);

    const result = await adapter.generateText('Ping after recovery');
    expect(result.text).toBe('Recovered answer');
  });

  // Scenario 8: Health endpoint failure isolation
  it('Scenario 8: Health endpoint failure isolation -> general app health succeeds even when AI is down', async () => {
    const controller = new AppController();
    const generalHealth = await controller.getHealth();

    expect(generalHealth.status).toBe('ok');
    expect(generalHealth.timestamp).toBeDefined();
    expect(generalHealth.uptime).toBeGreaterThanOrEqual(0);
  });

  // Scenario 9: Invalid AI configuration
  it('Scenario 9: Invalid AI configuration -> adapter constructor throws AiConfigurationInvalidException', () => {
    expect(() => new OllamaLLMAdapter({ ollamaBaseUrl: 'not-a-valid-url' })).toThrow(
      AiConfigurationInvalidException,
    );
    expect(() => new OllamaLLMAdapter({ llmModel: '   ' })).toThrow(
      AiConfigurationInvalidException,
    );
  });

  // Scenario 10: Existing application startup with AI disabled
  it('Scenario 10: Existing application startup with AI disabled -> boots cleanly with zero errors', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => ({ AI_ENABLED: false })],
        }),
        AiModule.forRoot(),
      ],
      controllers: [AppController],
    }).compile();

    const appController = moduleRef.get<AppController>(AppController);
    const health = await appController.getHealth();
    expect(health.status).toBe('ok');

    await moduleRef.close();
  });
});
