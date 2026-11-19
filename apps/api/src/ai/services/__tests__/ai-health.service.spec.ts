import { AiHealthService } from '../ai-health.service';
import { MockLLMAdapter } from '../../adapters/mocks/mock-llm.adapter';
import { MockEmbeddingAdapter } from '../../adapters/mocks/mock-embedding.adapter';
import { AiConfiguration, DEFAULT_AI_CONFIG } from '../../config/ai.config';

describe('AiHealthService', () => {
  let llmAdapter: MockLLMAdapter;
  let embeddingAdapter: MockEmbeddingAdapter;

  beforeEach(() => {
    llmAdapter = new MockLLMAdapter();
    embeddingAdapter = new MockEmbeddingAdapter();
  });

  it('should return DISABLED status when AI is not enabled', async () => {
    const config: AiConfiguration = {
      ...DEFAULT_AI_CONFIG,
      enabled: false,
    };

    const service = new AiHealthService(config, llmAdapter, embeddingAdapter);
    const report = await service.getHealthReport();

    expect(report.enabled).toBe(false);
    expect(report.overallStatus).toBe('DISABLED');
    expect(report.llm.isHealthy).toBe(false);
    expect(report.embedding.isHealthy).toBe(false);
  });

  it('should return OPERATIONAL when AI is enabled and both providers are healthy', async () => {
    const config: AiConfiguration = {
      ...DEFAULT_AI_CONFIG,
      enabled: true,
    };

    const service = new AiHealthService(config, llmAdapter, embeddingAdapter);
    const report = await service.getHealthReport();

    expect(report.enabled).toBe(true);
    expect(report.overallStatus).toBe('OPERATIONAL');
    expect(report.llm.isHealthy).toBe(true);
    expect(report.embedding.isHealthy).toBe(true);
  });

  it('should return DEGRADED when only one provider is healthy', async () => {
    const config: AiConfiguration = {
      ...DEFAULT_AI_CONFIG,
      enabled: true,
    };

    jest.spyOn(llmAdapter, 'checkHealth').mockResolvedValue({
      isHealthy: false,
      model: 'qwen3:4b',
      latencyMs: 10,
    });

    const service = new AiHealthService(config, llmAdapter, embeddingAdapter);
    const report = await service.getHealthReport();

    expect(report.enabled).toBe(true);
    expect(report.overallStatus).toBe('DEGRADED');
    expect(report.llm.isHealthy).toBe(false);
    expect(report.embedding.isHealthy).toBe(true);
  });

  it('should return OFFLINE when both providers are unhealthy', async () => {
    const config: AiConfiguration = {
      ...DEFAULT_AI_CONFIG,
      enabled: true,
    };

    jest.spyOn(llmAdapter, 'checkHealth').mockResolvedValue({
      isHealthy: false,
      model: 'qwen3:4b',
      latencyMs: 10,
    });
    jest.spyOn(embeddingAdapter, 'checkHealth').mockResolvedValue({
      isHealthy: false,
      model: 'bge-m3:latest',
      latencyMs: 10,
    });

    const service = new AiHealthService(config, llmAdapter, embeddingAdapter);
    const report = await service.getHealthReport();

    expect(report.enabled).toBe(true);
    expect(report.overallStatus).toBe('OFFLINE');
    expect(report.llm.isHealthy).toBe(false);
    expect(report.embedding.isHealthy).toBe(false);
  });
});
