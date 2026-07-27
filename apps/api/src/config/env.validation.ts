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
