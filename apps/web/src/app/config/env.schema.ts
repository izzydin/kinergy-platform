import { z } from 'zod';

export const clientEnvSchema = z.object({
  MODE: z.enum(['development', 'production', 'test']).default('development'),
  DEV: z.boolean().default(true),
  PROD: z.boolean().default(false),
  VITE_API_BASE_URL: z.string().url().default('http://localhost:3000/api/v1'),
  VITE_APP_TITLE: z.string().default('Kinergy Platform'),
  VITE_ENABLE_MSW: z.string().optional().default('true'),
  VITE_ENABLE_TELEMETRY: z.string().optional().default('true'),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;

/**
 * Validates import.meta.env variables against clientEnvSchema.
 * Throws structured diagnostic errors if invalid.
 */
export function validateClientEnv(envInput: Record<string, unknown> = import.meta.env): ClientEnv {
  const result = clientEnvSchema.safeParse(envInput);

  if (!result.success) {
    throw new Error(
      `Invalid frontend environment variables: ${JSON.stringify(result.error.flatten().fieldErrors)}`,
    );
  }

  return result.data;
}
