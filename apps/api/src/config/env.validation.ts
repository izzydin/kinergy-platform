import { z } from 'zod';

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().min(1000).max(65535).default(3000),
    API_PREFIX: z.string().default('api/v1'),
    DATABASE_URL: z
      .string()
      .min(1, 'DATABASE_URL is required')
      .default('postgresql://postgres:postgres@localhost:5432/kinergy_db?schema=public'),
    CORS_ORIGINS: z.string().default('http://localhost:4200'),
    CORS_ALLOWED_METHODS: z.string().default('GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS'),
    CORS_ALLOWED_HEADERS: z
      .string()
      .default('Content-Type,Authorization,X-Requested-With,Accept,Origin,X-Tenant-ID'),
    CORS_EXPOSED_HEADERS: z
      .string()
      .default('Content-Range,X-Content-Range,X-Total-Count,X-Request-ID'),
    CORS_MAX_AGE: z.coerce.number().positive().default(86400),
    CORS_ALLOW_CREDENTIALS: z
      .union([z.boolean(), z.string()])
      .transform((val) => (typeof val === 'boolean' ? val : val === 'true' || val === '1'))
      .default(true),
    CORS_TENANT_DOMAIN_PATTERN: z.string().optional(),
    SWAGGER_ENABLED: z
      .union([z.boolean(), z.string()])
      .transform((val) => {
        if (typeof val === 'boolean') return val;
        return val === 'true' || val === '1';
      })
      .default(true),
    JWT_ACCESS_SECRET: z
      .string()
      .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters long.')
      .default('kinergy-platform-dev-access-secret-min-32-chars!'),
    JWT_REFRESH_SECRET: z
      .string()
      .min(32, 'JWT_REFRESH_SECRET must be at least 32 characters long.')
      .default('kinergy-platform-dev-refresh-secret-min-32-chars!'),
    JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
    JWT_ISSUER: z.string().default('kinergy-platform'),
    JWT_AUDIENCE: z.string().default('kinergy-api'),
    THROTTLE_LIMIT: z.coerce.number().positive().default(120),
    THROTTLE_TTL: z.coerce.number().positive().default(60),
    TRUST_PROXY: z.union([z.boolean(), z.number(), z.string()]).default(1),
    AUTH_LOGIN_LIMIT: z.coerce.number().positive().default(5),
    AUTH_LOGIN_WINDOW: z.coerce.number().positive().default(60),
    AUTH_REFRESH_LIMIT: z.coerce.number().positive().default(20),
    AUTH_REFRESH_WINDOW: z.coerce.number().positive().default(60),
    AUTH_LOGOUT_LIMIT: z.coerce.number().positive().default(30),
    AUTH_LOGOUT_WINDOW: z.coerce.number().positive().default(60),
    AUTH_ME_LIMIT: z.coerce.number().positive().default(60),
    AUTH_ME_WINDOW: z.coerce.number().positive().default(60),
    // Password Infrastructure & Policy Settings
    ARGON2_MEMORY_COST: z.coerce.number().min(15360).default(65536), // Minimum 15 MB, Default 64 MB
    ARGON2_TIME_COST: z.coerce.number().min(1).default(3),
    ARGON2_PARALLELISM: z.coerce.number().min(1).default(4),
    ARGON2_HASH_LENGTH: z.coerce.number().min(16).default(32),
    PASSWORD_MIN_LENGTH: z.coerce.number().min(8).max(128).default(12),
    PASSWORD_MAX_LENGTH: z.coerce.number().min(32).max(256).default(128),
    PASSWORD_REQUIRE_UPPERCASE: z
      .union([z.boolean(), z.string()])
      .transform((val) => (typeof val === 'boolean' ? val : val === 'true' || val === '1'))
      .default(true),
    PASSWORD_REQUIRE_LOWERCASE: z
      .union([z.boolean(), z.string()])
      .transform((val) => (typeof val === 'boolean' ? val : val === 'true' || val === '1'))
      .default(true),
    PASSWORD_REQUIRE_NUMBER: z
      .union([z.boolean(), z.string()])
      .transform((val) => (typeof val === 'boolean' ? val : val === 'true' || val === '1'))
      .default(true),
    PASSWORD_REQUIRE_SPECIAL_CHAR: z
      .union([z.boolean(), z.string()])
      .transform((val) => (typeof val === 'boolean' ? val : val === 'true' || val === '1'))
      .default(true),
    PASSWORD_HISTORY_LIMIT: z.coerce.number().min(0).max(24).default(5),
    // External Object & Media Storage Settings (Milestone 10.5)
    STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_ROOT: z.string().default('./.storage'),
    STORAGE_S3_ENDPOINT: z.string().optional(),
    STORAGE_S3_REGION: z.string().default('auto'),
    STORAGE_S3_BUCKET: z.string().default('kinergy-staging-media'),
    STORAGE_S3_ACCESS_KEY_ID: z.string().optional(),
    STORAGE_S3_SECRET_ACCESS_KEY: z.string().optional(),
    STORAGE_S3_FORCE_PATH_STYLE: z
      .union([z.boolean(), z.string()])
      .transform((val) => (typeof val === 'boolean' ? val : val === 'true' || val === '1'))
      .default(false),
    STORAGE_MAX_FILE_SIZE_BYTES: z.coerce
      .number()
      .positive()
      .default(10 * 1024 * 1024),
    STORAGE_SIGNED_URL_EXPIRATION_SECONDS: z.coerce.number().positive().default(900),
    STORAGE_TENANT_QUOTA_BYTES: z.coerce
      .number()
      .positive()
      .default(5 * 1024 * 1024 * 1024),
    // Artificial Intelligence & Local Inference Settings (AI-02)
    AI_ENABLED: z
      .union([z.boolean(), z.string()])
      .transform((val) => (typeof val === 'boolean' ? val : val === 'true' || val === '1'))
      .default(false),
    AI_LLM_PROVIDER: z.enum(['mock', 'ollama']).default('mock'),
    AI_EMBEDDING_PROVIDER: z.enum(['mock', 'ollama']).default('mock'),
    AI_OLLAMA_BASE_URL: z.string().default('http://127.0.0.1:11434'),
    AI_OLLAMA_REQUEST_TIMEOUT_MS: z.coerce.number().positive().default(30000),
    AI_OLLAMA_HEALTH_TIMEOUT_MS: z.coerce.number().positive().default(3000),
    AI_CHAT_MODEL: z.string().default('qwen3:4b'),
    AI_CHAT_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.2),
    AI_CHAT_MAX_OUTPUT_TOKENS: z.coerce.number().positive().max(32768).default(512),
    AI_CHAT_CONTEXT_WINDOW: z.coerce.number().positive().max(262144).default(4096),
    AI_CHAT_MAX_CONCURRENT_REQUESTS: z.coerce.number().positive().max(16).default(1),
    AI_EMBEDDING_MODEL: z.string().default('bge-m3:latest'),
    AI_EMBEDDING_DIMENSIONS: z.coerce.number().positive().default(1024),
    AI_EMBEDDING_BATCH_SIZE: z.coerce.number().positive().max(128).default(16),
    AI_EMBEDDING_MAX_CONCURRENT_REQUESTS: z.coerce.number().positive().max(16).default(2),
    AI_HEALTH_CHECK_ENABLED: z
      .union([z.boolean(), z.string()])
      .transform((val) => (typeof val === 'boolean' ? val : val === 'true' || val === '1'))
      .default(true),
    AI_PROVIDER_STARTUP_CHECK: z
      .union([z.boolean(), z.string()])
      .transform((val) => (typeof val === 'boolean' ? val : val === 'true' || val === '1'))
      .default(false),
    AI_PROVIDER_FAILURE_THRESHOLD: z.coerce.number().positive().default(3),
    // Aliases for backwards compatibility
    AI_LLM_MODEL: z.string().optional(),
    AI_TIMEOUT_MS: z.coerce.number().positive().optional(),
    AI_MAX_PARALLEL_GENERATION: z.coerce.number().positive().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
      const devAccessSecret = 'kinergy-platform-dev-access-secret-min-32-chars!';
      const devRefreshSecret = 'kinergy-platform-dev-refresh-secret-min-32-chars!';
      const defaultDevDatabaseUrl =
        'postgresql://postgres:postgres@localhost:5432/kinergy_db?schema=public';

      if (
        !data.DATABASE_URL ||
        data.DATABASE_URL.trim() === '' ||
        data.DATABASE_URL === defaultDevDatabaseUrl ||
        data.DATABASE_URL.includes('localhost') ||
        data.DATABASE_URL.includes('127.0.0.1')
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'DATABASE_URL must be explicitly configured with a non-localhost remote database host when NODE_ENV is "production".',
          path: ['DATABASE_URL'],
        });
      }

      if (
        !data.JWT_ACCESS_SECRET ||
        data.JWT_ACCESS_SECRET.trim().length < 32 ||
        data.JWT_ACCESS_SECRET === devAccessSecret
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'JWT_ACCESS_SECRET is required in production environment and must be a custom secret at least 32 characters long.',
          path: ['JWT_ACCESS_SECRET'],
        });
      }
      if (
        !data.JWT_REFRESH_SECRET ||
        data.JWT_REFRESH_SECRET.trim().length < 32 ||
        data.JWT_REFRESH_SECRET === devRefreshSecret
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'JWT_REFRESH_SECRET is required in production environment and must be a custom secret at least 32 characters long.',
          path: ['JWT_REFRESH_SECRET'],
        });
      }
      if (
        data.CORS_ORIGINS.split(',')
          .map((o) => o.trim())
          .includes('*')
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Wildcard CORS_ORIGINS ("*") is strictly prohibited in production environment.',
          path: ['CORS_ORIGINS'],
        });
      }
    }

    if (data.AI_ENABLED) {
      if (
        !data.AI_OLLAMA_BASE_URL ||
        (!data.AI_OLLAMA_BASE_URL.startsWith('http://') &&
          !data.AI_OLLAMA_BASE_URL.startsWith('https://'))
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'AI_OLLAMA_BASE_URL must be a valid HTTP or HTTPS URL when AI_ENABLED is true.',
          path: ['AI_OLLAMA_BASE_URL'],
        });
      }
      if (data.AI_EMBEDDING_DIMENSIONS !== 1024) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'AI_EMBEDDING_DIMENSIONS must be strictly 1024 when BGE-M3 is configured (AI-01 requirement).',
          path: ['AI_EMBEDDING_DIMENSIONS'],
        });
      }
    }
  });

export type EnvironmentVariables = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const formattedErrors = result.error.format();
    throw new Error(
      `Invalid environment configuration: ${JSON.stringify(formattedErrors, null, 2)}`,
    );
  }

  return result.data;
}
