/**
 * Shared Platform Configuration & Constants
 */

export const APP_CONFIG = {
  APP_NAME: 'Kinergy Platform',
  DEFAULT_API_VERSION: 'v1',
  SUPPORTED_LOCALES: ['en', 'es'],
} as const;

export type AppConfig = typeof APP_CONFIG;
