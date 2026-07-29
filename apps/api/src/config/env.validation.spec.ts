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

  it('should validate production environment configuration with valid JWT secrets and origins', () => {
    const rawEnv = {
      NODE_ENV: 'production',
      PORT: '8080',
      DATABASE_URL: 'postgresql://prod_user:secret@prod-db.internal:5432/kinergy_prod',
      CORS_ORIGINS: 'https://app.kinergy.com,https://admin.kinergy.com',
      SWAGGER_ENABLED: 'false',
      JWT_ACCESS_SECRET: 'production-access-secret-at-least-32-chars-long!',
      JWT_REFRESH_SECRET: 'production-refresh-secret-at-least-32-chars-long!',
    };

    const env = validateEnv(rawEnv);
    expect(env.NODE_ENV).toBe('production');
    expect(env.PORT).toBe(8080);
    expect(env.SWAGGER_ENABLED).toBe(false);
    expect(env.JWT_ACCESS_SECRET).toBe('production-access-secret-at-least-32-chars-long!');
    expect(env.JWT_REFRESH_SECRET).toBe('production-refresh-secret-at-least-32-chars-long!');
    expect(env.CORS_ORIGINS).toBe('https://app.kinergy.com,https://admin.kinergy.com');
  });

  it('should throw an error in production environment if CORS_ORIGINS contains wildcard "*"', () => {
    const rawEnv = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://prod_user:secret@prod-db.internal:5432/kinergy_prod',
      CORS_ORIGINS: '*',
      JWT_ACCESS_SECRET: 'production-access-secret-at-least-32-chars-long!',
      JWT_REFRESH_SECRET: 'production-refresh-secret-at-least-32-chars-long!',
    };

    expect(() => validateEnv(rawEnv)).toThrow(/Wildcard CORS_ORIGINS/);
  });

  it('should throw an error in production environment if JWT_ACCESS_SECRET is missing', () => {
    const rawEnv = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://prod_user:secret@prod-db.internal:5432/kinergy_prod',
      JWT_REFRESH_SECRET: 'production-refresh-secret-at-least-32-chars-long!',
    };

    expect(() => validateEnv(rawEnv)).toThrow(
      'JWT_ACCESS_SECRET is required in production environment',
    );
  });

  it('should throw an error in production environment if JWT_REFRESH_SECRET is missing', () => {
    const rawEnv = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://prod_user:secret@prod-db.internal:5432/kinergy_prod',
      JWT_ACCESS_SECRET: 'production-access-secret-at-least-32-chars-long!',
    };

    expect(() => validateEnv(rawEnv)).toThrow(
      'JWT_REFRESH_SECRET is required in production environment',
    );
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
