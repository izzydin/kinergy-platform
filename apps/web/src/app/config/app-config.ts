import { validateClientEnv, type ClientEnv } from './env.schema';

/**
 * Application Configuration Schema & Environment Resolver
 * Scope: Application Shell Configuration (Composition Root)
 *
 * Single source of truth for runtime frontend configuration.
 * Feature modules MUST consume this abstraction rather than reading import.meta.env directly.
 */
export interface AppConfig {
  readonly env: 'development' | 'test' | 'production';
  readonly isDev: boolean;
  readonly isProd: boolean;
  readonly isTest: boolean;
  readonly apiBaseUrl: string;
  readonly appTitle: string;
  readonly enableTelemetry: boolean;
  readonly enableMsw: boolean;
  readonly queryDefaultStaleTimeMs: number;
  readonly queryMaxRetries: number;
}

let cachedConfig: AppConfig | null = null;

/**
 * Resets the cached singleton configuration instance.
 * Used primarily during unit tests to isolate test environment variations.
 */
export function resetAppConfigCache(): void {
  cachedConfig = null;
}

/**
 * Resolves strongly-typed application configuration from Vite environment variables.
 * Enforces fail-fast validation against Zod schemas and caches the resulting singleton.
 *
 * @param overrides Optional partial config overrides for testing
 * @param envInput Optional raw environment record for testing (bypasses import.meta.env)
 */
export function getAppConfig(
  overrides?: Partial<AppConfig>,
  envInput?: Record<string, unknown>,
): AppConfig {
  // If overrides or explicit envInput are provided (e.g. unit tests), compute without mutating singleton cache
  if (overrides || envInput) {
    return createConfigInstance(overrides, envInput);
  }

  if (!cachedConfig) {
    cachedConfig = createConfigInstance();
  }

  return cachedConfig;
}

function createConfigInstance(
  overrides?: Partial<AppConfig>,
  envInput?: Record<string, unknown>,
): AppConfig {
  // 1. Validate raw environment input (defaults to import.meta.env if available)
  const validatedEnv: ClientEnv = validateClientEnv(envInput);

  const envMode = validatedEnv.MODE;

  const baseConfig: AppConfig = {
    env: envMode,
    isDev: envMode === 'development',
    isProd: envMode === 'production',
    isTest: envMode === 'test',
    apiBaseUrl: validatedEnv.VITE_API_BASE_URL,
    appTitle: validatedEnv.VITE_APP_TITLE,
    enableTelemetry: validatedEnv.VITE_ENABLE_TELEMETRY,
    enableMsw: validatedEnv.VITE_ENABLE_MSW,
    queryDefaultStaleTimeMs: 1000 * 60 * 5, // 5 minutes default stale time
    queryMaxRetries: 3, // Max 3 exponential backoff retries for 5xx/network errors
  };

  return {
    ...baseConfig,
    ...overrides,
  };
}
