import {
  checkForbiddenSecrets,
  clientEnvSchema,
  FORBIDDEN_SERVER_SECRET_PATTERNS,
  getAppConfig,
  resetAppConfigCache,
  validateClientEnv,
} from '../index';

describe('Step A6.1 — Frontend Environment Configuration Architecture', () => {
  beforeEach(() => {
    resetAppConfigCache();
  });

  describe('1. Valid Configuration Parsing', () => {
    it('parses valid development configuration with default values', () => {
      const config = getAppConfig(undefined, {
        MODE: 'development',
        VITE_API_BASE_URL: 'http://localhost:3000/api/v1',
        VITE_APP_TITLE: 'Kinergy Platform Dev',
        VITE_ENABLE_MSW: 'true',
        VITE_ENABLE_TELEMETRY: 'true',
      });

      expect(config.env).toBe('development');
      expect(config.isDev).toBe(true);
      expect(config.isProd).toBe(false);
      expect(config.isTest).toBe(false);
      expect(config.apiBaseUrl).toBe('http://localhost:3000/api/v1');
      expect(config.appTitle).toBe('Kinergy Platform Dev');
      expect(config.enableMsw).toBe(true);
      expect(config.enableTelemetry).toBe(true);
    });

    it('parses valid test configuration', () => {
      const config = getAppConfig(undefined, {
        MODE: 'test',
        VITE_API_BASE_URL: 'http://localhost:3000/api/v1',
        VITE_APP_TITLE: 'Kinergy Platform Test',
        VITE_ENABLE_MSW: 'false',
        VITE_ENABLE_TELEMETRY: 'false',
      });

      expect(config.env).toBe('test');
      expect(config.isDev).toBe(false);
      expect(config.isTest).toBe(true);
      expect(config.isProd).toBe(false);
      expect(config.enableMsw).toBe(false);
      expect(config.enableTelemetry).toBe(false);
    });

    it('parses valid production configuration with absolute HTTPS URL', () => {
      const config = getAppConfig(undefined, {
        MODE: 'production',
        VITE_API_BASE_URL: 'https://api.kinergy-platform.io/api/v1',
        VITE_APP_TITLE: 'Kinergy Platform',
        VITE_ENABLE_MSW: 'false',
        VITE_ENABLE_TELEMETRY: 'true',
      });

      expect(config.env).toBe('production');
      expect(config.isProd).toBe(true);
      expect(config.isDev).toBe(false);
      expect(config.apiBaseUrl).toBe('https://api.kinergy-platform.io/api/v1');
      expect(config.enableMsw).toBe(false);
    });

    it('accepts root-relative API paths (e.g. /api/v1)', () => {
      const validated = validateClientEnv({
        MODE: 'development',
        VITE_API_BASE_URL: '/api/v1',
      });

      expect(validated.VITE_API_BASE_URL).toBe('/api/v1');
    });

    it('exports defined clientEnvSchema Zod object', () => {
      expect(clientEnvSchema).toBeDefined();
      const parsed = clientEnvSchema.safeParse({
        MODE: 'development',
        VITE_API_BASE_URL: 'http://localhost:3000/api/v1',
      });
      expect(parsed.success).toBe(true);
    });
  });

  describe('2. Fail-Fast Validation (Missing & Malformed Configurations)', () => {
    it('fails fast when MODE is an invalid enum value', () => {
      expect(() => {
        validateClientEnv({
          MODE: 'staging',
          VITE_API_BASE_URL: 'http://localhost:3000/api/v1',
        });
      }).toThrow(/FAIL-FAST: Invalid frontend environment configuration/);
    });

    it('fails fast when VITE_API_BASE_URL is empty', () => {
      expect(() => {
        validateClientEnv({
          MODE: 'development',
          VITE_API_BASE_URL: '',
        });
      }).toThrow(/FAIL-FAST: Invalid frontend environment configuration/);
    });

    it('fails fast when VITE_API_BASE_URL is a malformed string', () => {
      expect(() => {
        validateClientEnv({
          MODE: 'development',
          VITE_API_BASE_URL: 'not-a-valid-url-or-relative-path',
        });
      }).toThrow(/FAIL-FAST: Invalid frontend environment configuration/);
    });

    it('fails fast when production MODE uses a localhost development API URL', () => {
      expect(() => {
        validateClientEnv({
          MODE: 'production',
          VITE_API_BASE_URL: 'http://localhost:3000/api/v1',
        });
      }).toThrow(/VITE_API_BASE_URL cannot use a localhost development URL in production mode/);
    });

    it('fails fast when production MODE uses 127.0.0.1 loopback URL', () => {
      expect(() => {
        validateClientEnv({
          MODE: 'production',
          VITE_API_BASE_URL: 'http://127.0.0.1:3000/api/v1',
        });
      }).toThrow(/VITE_API_BASE_URL cannot use a localhost development URL in production mode/);
    });
  });

  describe('3. Security Audit & Forbidden Server Secrets Guard', () => {
    it('lists standard forbidden server secret patterns', () => {
      expect(FORBIDDEN_SERVER_SECRET_PATTERNS).toContain('JWT_SECRET');
      expect(FORBIDDEN_SERVER_SECRET_PATTERNS).toContain('JWT_ACCESS_SECRET');
      expect(FORBIDDEN_SERVER_SECRET_PATTERNS).toContain('DATABASE_URL');
      expect(FORBIDDEN_SERVER_SECRET_PATTERNS).toContain('PORT');
      expect(FORBIDDEN_SERVER_SECRET_PATTERNS).toContain('ARGON2_MEMORY_COST');
    });

    it('throws security violation if JWT_ACCESS_SECRET is present in frontend env', () => {
      expect(() => {
        checkForbiddenSecrets({
          MODE: 'development',
          VITE_API_BASE_URL: 'http://localhost:3000/api/v1',
          JWT_ACCESS_SECRET: 'secret-key-that-should-never-be-in-frontend',
        });
      }).toThrow(/SECURITY VIOLATION: Server-side secrets detected/);
    });

    it('throws security violation if DATABASE_URL is present in frontend env', () => {
      expect(() => {
        checkForbiddenSecrets({
          MODE: 'development',
          VITE_API_BASE_URL: 'http://localhost:3000/api/v1',
          DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/kinergy_db',
        });
      }).toThrow(/SECURITY VIOLATION: Server-side secrets detected/);
    });

    it('throws security violation if ARGON2 parameters or private keys are injected', () => {
      expect(() => {
        validateClientEnv({
          MODE: 'development',
          VITE_API_BASE_URL: 'http://localhost:3000/api/v1',
          ARGON2_MEMORY_COST: '65536',
        });
      }).toThrow(/SECURITY VIOLATION: Server-side secrets detected/);
    });
  });

  describe('4. Singleton Cache & Overrides', () => {
    it('caches the resolved AppConfig singleton instance', () => {
      const config1 = getAppConfig();
      const config2 = getAppConfig();

      expect(config1).toBe(config2);
      expect(config1.apiBaseUrl).toBe(config2.apiBaseUrl);
    });

    it('clears singleton cache when resetAppConfigCache() is called', () => {
      const config1 = getAppConfig(undefined, {
        MODE: 'development',
        VITE_API_BASE_URL: 'http://localhost:3000/api/v1',
        VITE_APP_TITLE: 'Config 1',
      });

      expect(config1.appTitle).toBe('Config 1');
      resetAppConfigCache();

      const config2 = getAppConfig(undefined, {
        MODE: 'development',
        VITE_API_BASE_URL: 'http://localhost:3000/api/v1',
        VITE_APP_TITLE: 'Config 2',
      });

      expect(config2.appTitle).toBe('Config 2');
    });

    it('allows partial property overrides for testing scenarios', () => {
      const config = getAppConfig(
        { queryMaxRetries: 5, enableMsw: false },
        {
          MODE: 'development',
          VITE_API_BASE_URL: 'http://localhost:3000/api/v1',
        },
      );

      expect(config.queryMaxRetries).toBe(5);
      expect(config.enableMsw).toBe(false);
      expect(config.apiBaseUrl).toBe('http://localhost:3000/api/v1');
    });
  });
});
