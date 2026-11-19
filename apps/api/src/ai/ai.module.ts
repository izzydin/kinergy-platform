import {
  Module,
  DynamicModule,
  Global,
  OnApplicationBootstrap,
  Logger,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AI_LLM_PROVIDER_TOKEN, AI_EMBEDDING_PROVIDER_TOKEN, AI_CONFIG_TOKEN } from './ai.tokens';
import { AiConfiguration, DEFAULT_AI_CONFIG } from './config/ai.config';
import { OllamaLLMAdapter } from './adapters/llm/ollama-llm.adapter';
import { OllamaEmbeddingAdapter } from './adapters/embedding/ollama-embedding.adapter';
import { MockLLMAdapter } from './adapters/mocks/mock-llm.adapter';
import { MockEmbeddingAdapter } from './adapters/mocks/mock-embedding.adapter';
import { AiHealthService } from './services/ai-health.service';
import { AiHealthController } from './controllers/ai-health.controller';

export interface AiModuleOptions {
  useMocks?: boolean;
}

@Global()
@Module({})
export class AiModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(AiModule.name);

  constructor(
    @Inject(AI_CONFIG_TOKEN) private readonly config: AiConfiguration,
    private readonly healthService: AiHealthService,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    if (!this.config.enabled) {
      this.logger.log('Kynergy Intelligence AI subsystem is DISABLED by default (Rule 6).');
      return;
    }

    if (!this.config.startupCheckEnabled) {
      this.logger.log(
        `Kynergy Intelligence enabled with provider '${this.config.llmProvider}'. Startup health probe is deferred.`,
      );
      return;
    }

    try {
      const report = await this.healthService.getHealthReport();
      if (report.overallStatus === 'OPERATIONAL') {
        this.logger.log(
          `Kynergy Intelligence operational: Chat [${report.models.chat.name}], Embed [${report.models.embedding.name}].`,
        );
      } else {
        this.logger.warn(
          `Kynergy Intelligence startup warning: status is ${report.overallStatus}. Core platform remains operational.`,
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown probe error';
      this.logger.warn(`Kynergy Intelligence probe warning: ${msg}. Core platform unaffected.`);
    }
  }

  public static forRoot(options: AiModuleOptions = {}): DynamicModule {
    const configProvider = {
      provide: AI_CONFIG_TOKEN,
      useFactory: (configService: ConfigService): AiConfiguration => {
        const enabled = configService.get<boolean>('AI_ENABLED', DEFAULT_AI_CONFIG.enabled);
        const llmModel =
          configService.get<string>('AI_CHAT_MODEL') ??
          configService.get<string>('AI_LLM_MODEL', DEFAULT_AI_CONFIG.chatModel);
        const requestTimeoutMs =
          configService.get<number>('AI_OLLAMA_REQUEST_TIMEOUT_MS') ??
          configService.get<number>('AI_TIMEOUT_MS', DEFAULT_AI_CONFIG.requestTimeoutMs);
        const chatMaxConcurrent =
          configService.get<number>('AI_CHAT_MAX_CONCURRENT_REQUESTS') ??
          configService.get<number>(
            'AI_MAX_PARALLEL_GENERATION',
            DEFAULT_AI_CONFIG.chatMaxConcurrent,
          );

        return {
          enabled,
          llmProvider: configService.get<'mock' | 'ollama'>(
            'AI_LLM_PROVIDER',
            DEFAULT_AI_CONFIG.llmProvider,
          ),
          embeddingProvider: configService.get<'mock' | 'ollama'>(
            'AI_EMBEDDING_PROVIDER',
            DEFAULT_AI_CONFIG.embeddingProvider,
          ),
          ollamaBaseUrl: configService.get<string>(
            'AI_OLLAMA_BASE_URL',
            DEFAULT_AI_CONFIG.ollamaBaseUrl,
          ),
          requestTimeoutMs,
          healthTimeoutMs: configService.get<number>(
            'AI_OLLAMA_HEALTH_TIMEOUT_MS',
            DEFAULT_AI_CONFIG.healthTimeoutMs,
          ),
          chatModel: llmModel,
          chatTemperature: configService.get<number>(
            'AI_CHAT_TEMPERATURE',
            DEFAULT_AI_CONFIG.chatTemperature,
          ),
          chatMaxTokens: configService.get<number>(
            'AI_CHAT_MAX_OUTPUT_TOKENS',
            DEFAULT_AI_CONFIG.chatMaxTokens,
          ),
          chatContextWindow: configService.get<number>(
            'AI_CHAT_CONTEXT_WINDOW',
            DEFAULT_AI_CONFIG.chatContextWindow,
          ),
          chatMaxConcurrent,
          embeddingModel: configService.get<string>(
            'AI_EMBEDDING_MODEL',
            DEFAULT_AI_CONFIG.embeddingModel,
          ),
          embeddingDimensions: configService.get<number>(
            'AI_EMBEDDING_DIMENSIONS',
            DEFAULT_AI_CONFIG.embeddingDimensions,
          ),
          embeddingBatchSize: configService.get<number>(
            'AI_EMBEDDING_BATCH_SIZE',
            DEFAULT_AI_CONFIG.embeddingBatchSize,
          ),
          embeddingMaxConcurrent: configService.get<number>(
            'AI_EMBEDDING_MAX_CONCURRENT_REQUESTS',
            DEFAULT_AI_CONFIG.embeddingMaxConcurrent,
          ),
          healthCheckEnabled: configService.get<boolean>(
            'AI_HEALTH_CHECK_ENABLED',
            DEFAULT_AI_CONFIG.healthCheckEnabled,
          ),
          startupCheckEnabled: configService.get<boolean>(
            'AI_PROVIDER_STARTUP_CHECK',
            DEFAULT_AI_CONFIG.startupCheckEnabled,
          ),
          failureThreshold: configService.get<number>(
            'AI_PROVIDER_FAILURE_THRESHOLD',
            DEFAULT_AI_CONFIG.failureThreshold,
          ),
          // Aliases
          llmModel,
          timeoutMs: requestTimeoutMs,
          maxParallelGeneration: chatMaxConcurrent,
        };
      },
      inject: [ConfigService],
    };

    const llmProvider = {
      provide: AI_LLM_PROVIDER_TOKEN,
      useFactory: (aiConfig: AiConfiguration) => {
        if (!aiConfig.enabled || options.useMocks || aiConfig.llmProvider === 'mock') {
          return new MockLLMAdapter();
        }
        return new OllamaLLMAdapter(aiConfig);
      },
      inject: [AI_CONFIG_TOKEN],
    };

    const embeddingProvider = {
      provide: AI_EMBEDDING_PROVIDER_TOKEN,
      useFactory: (aiConfig: AiConfiguration) => {
        if (!aiConfig.enabled || options.useMocks || aiConfig.embeddingProvider === 'mock') {
          return new MockEmbeddingAdapter();
        }
        return new OllamaEmbeddingAdapter(aiConfig);
      },
      inject: [AI_CONFIG_TOKEN],
    };

    return {
      module: AiModule,
      controllers: [AiHealthController],
      providers: [configProvider, llmProvider, embeddingProvider, AiHealthService],
      exports: [
        AI_CONFIG_TOKEN,
        AI_LLM_PROVIDER_TOKEN,
        AI_EMBEDDING_PROVIDER_TOKEN,
        AiHealthService,
      ],
    };
  }
}
