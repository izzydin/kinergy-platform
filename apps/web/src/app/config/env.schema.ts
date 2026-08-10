import { z } from 'zod';

/**
 * List of forbidden server-side secret key patterns that MUST NEVER exist in frontend environment variables.
 * Ingesting any of these keys into the browser configuration boundary triggers an immediate security exception.
 */
export const FORBIDDEN_SERVER_SECRET_PATTERNS = [
  'JWT_SECRET',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'DATABASE_URL',
  'PORT',
  'ARGON2_MEMORY_COST',
  'ARGON2_TIME_COST',
  'ARGON2_PARALLELISM',
  'PRIVATE_KEY',
  'SECRET_KEY',
  'API_SECRET',
  'DB_PASSWORD',
] as const;

/**
 * Audits environment keys for forbidden server-side secrets.
 * Throws a security violation exception if any sensitive secret key is detected.
 */
export function checkForbiddenSecrets(env: Record<string, unknown>): void {
  const keys = Object.keys(env);
  const foundSecrets: string[] = [];

  for (const key of keys) {
    const upperKey = key.toUpperCase();
    for (const pattern of FORBIDDEN_SERVER_SECRET_PATTERNS) {
      if (upperKey === pattern || upperKey.includes(pattern)) {
        foundSecrets.push(key);
      }
    }
  }

  if (foundSecrets.length > 0) {
    throw new Error(
      `SECURITY VIOLATION: Server-side secrets detected in frontend environment configuration: [${foundSecrets.join(
        ', ',
      )}]. Frontend code must NEVER expose private keys, database credentials, or JWT secrets.`,
    );
  }
}

/**
 * Zod schema for client-facing (public) environment variables.
 * Enforces strong typing, root-relative or absolute API URLs, and fail-fast validation.
 */
export const clientEnvSchema = z
  .object({
    MODE: z.enum(['development', 'production', 'test']).default('development'),
    DEV: z.boolean().optional(),
    PROD: z.boolean().optional(),
    VITE_API_BASE_URL: z
      .string()
      .min(1, { message: 'VITE_API_BASE_URL cannot be empty.' })
      .refine(
        (val) => {
          // Accept valid root-relative API path (e.g. /api/v1) or absolute URL
          if (val.startsWith('/')) return true;
          try {
            const parsed = new URL(val);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:';
          } catch {
            return false;
          }
        },
        {
          message:
            'VITE_API_BASE_URL must be a valid absolute HTTP/HTTPS URL or root-relative path (e.g. /api/v1).',
        },
      )
      .default('http://localhost:3000/api/v1'),
    VITE_APP_TITLE: z.string().min(1).default('Kinergy Platform'),
    VITE_ENABLE_MSW: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((val) => String(val) === 'true')
      .default('true'),
    VITE_ENABLE_TELEMETRY: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((val) => String(val) === 'true')
      .default('true'),
  })
  .superRefine((data, ctx) => {
    // Fail-fast rule: In production mode, VITE_API_BASE_URL must not rely on localhost dev default
    if (data.MODE === 'production') {
      if (
        data.VITE_API_BASE_URL.includes('localhost') ||
        data.VITE_API_BASE_URL.includes('127.0.0.1')
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['VITE_API_BASE_URL'],
          message:
            'FAIL-FAST: VITE_API_BASE_URL cannot use a localhost development URL in production mode.',
        });
      }
    }
  });

export type ClientEnv = z.infer<typeof clientEnvSchema>;

/**
 * Safely extracts client-scoped environment variables (VITE_*, MODE, DEV, PROD) across Vite browser runtime
 * and Jest/Node test execution environments without exposing raw Node process.env system variables.
 */
export function getRawEnv(): Record<string, unknown> {
  const source: Record<string, unknown> = (typeof process !== 'undefined' && process.env) || {};

  try {
    // Function constructor prevents TS1343 module syntax error in CJS jest compilation
    const fetchMetaEnv = new Function('try { return import.meta.env; } catch { return {}; }');
    const metaEnv = fetchMetaEnv();
    if (metaEnv && typeof metaEnv === 'object' && Object.keys(metaEnv).length > 0) {
      Object.assign(source, metaEnv);
    }
  } catch {
    // Fallback to process.env if import.meta is unavailable
  }

  const clientEnv: Record<string, unknown> = {};

  if (source.MODE || source.NODE_ENV) {
    clientEnv.MODE = source.MODE || source.NODE_ENV;
  }

  for (const key of Object.keys(source)) {
    if (key.startsWith('VITE_') || key === 'MODE' || key === 'DEV' || key === 'PROD') {
      clientEnv[key] = source[key];
    }
  }

  return clientEnv;
}

/**
 * Validates frontend environment variables against clientEnvSchema with fail-fast enforcement.
 * First audits environment keys for forbidden server secrets.
 */
export function validateClientEnv(envInput?: Record<string, unknown>): ClientEnv {
  const rawInput = envInput || getRawEnv();

  // 1. Audit for forbidden server secrets
  checkForbiddenSecrets(rawInput);

  // 2. Parse and validate against schema
  const result = clientEnvSchema.safeParse(rawInput);

  if (!result.success) {
    const formattedErrors = result.error.errors
      .map((e) => `[${e.path.join('.') || 'root'}]: ${e.message}`)
      .join('; ');
    throw new Error(`FAIL-FAST: Invalid frontend environment configuration: ${formattedErrors}`);
  }

  return result.data;
}
