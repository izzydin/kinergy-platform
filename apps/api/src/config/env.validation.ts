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
    JWT_ACCESS_SECRET: z.string().optional(),
    JWT_REFRESH_SECRET: z.string().optional(),
    JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
    JWT_ISSUER: z.string().default('kinergy-platform'),
    JWT_AUDIENCE: z.string().default('kinergy-api'),
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
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
      if (!data.JWT_ACCESS_SECRET || data.JWT_ACCESS_SECRET.trim().length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'JWT_ACCESS_SECRET is required in production environment and must be at least 32 characters long.',
          path: ['JWT_ACCESS_SECRET'],
        });
      }
      if (!data.JWT_REFRESH_SECRET || data.JWT_REFRESH_SECRET.trim().length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'JWT_REFRESH_SECRET is required in production environment and must be at least 32 characters long.',
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
