import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { AiModule } from '../ai.module';
import { AiHealthService } from '../services/ai-health.service';
import { AI_LLM_PROVIDER_TOKEN, AI_EMBEDDING_PROVIDER_TOKEN } from '../ai.tokens';
import { ILLMProviderPort, IEmbeddingProviderPort } from '@kinergy-platform/core';

describe('AI Subsystem Startup Isolation & Resilience (Rule 6 Compliance)', () => {
  let moduleRef: TestingModule;
  let healthService: AiHealthService;
  let llmProvider: ILLMProviderPort;
  let embeddingProvider: IEmbeddingProviderPort;

  beforeAll(async () => {
    // Intentionally configure an unreachable Ollama endpoint to simulate offline/crashed daemon
    process.env['AI_ENABLED'] = 'true';
    process.env['AI_LLM_PROVIDER'] = 'ollama';
    process.env['AI_EMBEDDING_PROVIDER'] = 'ollama';
    process.env['AI_OLLAMA_BASE_URL'] = 'http://127.0.0.1:59999'; // Dead port
    process.env['AI_TIMEOUT_MS'] = '500';

    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), AiModule.forRoot()],
    }).compile();

    healthService = moduleRef.get<AiHealthService>(AiHealthService);
    llmProvider = moduleRef.get<ILLMProviderPort>(AI_LLM_PROVIDER_TOKEN);
    embeddingProvider = moduleRef.get<IEmbeddingProviderPort>(AI_EMBEDDING_PROVIDER_TOKEN);
  });

  afterAll(async () => {
    await moduleRef.close();
    delete process.env['AI_ENABLED'];
    delete process.env['AI_LLM_PROVIDER'];
    delete process.env['AI_EMBEDDING_PROVIDER'];
    delete process.env['AI_OLLAMA_BASE_URL'];
    delete process.env['AI_TIMEOUT_MS'];
  });

  it('should compile and start NestJS module even when Ollama is completely unreachable', () => {
    expect(moduleRef).toBeDefined();
    expect(healthService).toBeDefined();
    expect(llmProvider).toBeDefined();
    expect(embeddingProvider).toBeDefined();
  });

  it('should report OFFLINE gracefully without throwing uncaught exceptions or crashing process', async () => {
    const report = await healthService.getHealthReport();
    expect(report.enabled).toBe(true);
    expect(report.overallStatus).toBe('OFFLINE');
    expect(report.llm.isHealthy).toBe(false);
    expect(report.embedding.isHealthy).toBe(false);
  });

  it('should fast-fail when inference is attempted against unreachable runtime', async () => {
    await expect(llmProvider.generateText('hello')).rejects.toThrow(/Ollama service unreachable/);
  });
});
