import { validateEnv } from './env.validation';

describe('Environment Variable Validation', () => {
  it('should validate and parse valid development environment variables', () => {
    const rawEnv = {
      NODE_ENV: 'development',
      PORT: '3000',
      API_PREFIX: 'api/v1',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/kinergy_db',
      CORS_ORIGINS: 'http://localhost:4200',
      SWAGGER_ENABLED: 'true',
    };

    const env = validateEnv(rawEnv);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.API_PREFIX).toBe('api/v1');
    expect(env.DATABASE_URL).toBe('postgresql://postgres:postgres@localhost:5432/kinergy_db');
    expect(env.SWAGGER_ENABLED).toBe(true);
  });

  it('should validate test environment configuration', () => {
    const rawEnv = {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/kinergy_test_db',
    };

    const env = validateEnv(rawEnv);
    expect(env.NODE_ENV).toBe('test');
    expect(env.PORT).toBe(3000);
  });

  it('should validate production environment configuration', () => {
    const rawEnv = {
      NODE_ENV: 'production',
      PORT: '8080',
      DATABASE_URL: 'postgresql://prod_user:secret@prod-db.internal:5432/kinergy_prod',
      SWAGGER_ENABLED: 'false',
    };

    const env = validateEnv(rawEnv);
    expect(env.NODE_ENV).toBe('production');
    expect(env.PORT).toBe(8080);
    expect(env.SWAGGER_ENABLED).toBe(false);
  });

  it('should throw an error if NODE_ENV is invalid', () => {
    const rawEnv = {
      NODE_ENV: 'invalid-env',
    };

    expect(() => validateEnv(rawEnv)).toThrow('Invalid environment configuration');
  });

  it('should throw an error if PORT is out of valid range', () => {
    const rawEnv = {
      PORT: '99',
    };

    expect(() => validateEnv(rawEnv)).toThrow('Invalid environment configuration');
  });
});
