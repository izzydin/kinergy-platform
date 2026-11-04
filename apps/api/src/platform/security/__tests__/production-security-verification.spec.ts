/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
import { HttpStatus, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { IsString } from 'class-validator';
import { AppController } from '../../../app.controller';
import { GlobalExceptionFilter } from '../../../common/filters/global-exception.filter';
import { GlobalSanitizationValidationPipe } from '../../../common/pipes/global-sanitization-validation.pipe';
import { helmetSecurityOptions } from '../../web-security/helmet/helmet-security.config';
import { validateEnv } from '../../../config/env.validation';
import { checkForbiddenSecrets } from '../../../../../web/src/app/config/env.schema';
import { StorageKeyUtil } from '../../storage/utils/storage-key.util';
import { StorageController } from '../../storage/controllers/storage.controller';
import { MediaStorageService } from '../../storage/services/media-storage.service';
import { StagingTestHelper } from '../../persistence/__tests__/staging-acceptance/staging-test-helper';

describe('Milestone 10.8 — Production Security & Operational Verification Specification', () => {
  let isDbAvailable = false;

  beforeAll(async () => {
    jest.setTimeout(30000);
    const activeUrl = await StagingTestHelper.resolveActivePostgresUrl();
    try {
      const probe = StagingTestHelper.createClient(activeUrl);
      await probe.$queryRawUnsafe('SELECT 1');
      await probe.$disconnect();
      isDbAvailable = true;
    } catch (error) {
      isDbAvailable = false;
      if (process.env['CI']) {
        throw new Error(
          `[FATAL] Staging database not available in CI environment at ${activeUrl}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          { cause: error },
        );
      }
    }
  });

  // ============================================================================
  // 1. Authentication & Authorization Hardening
  // ============================================================================
  describe('1. Authentication & Authorization Invariants', () => {
    it('verifies non-existent credentials return generic 401 error message without account enumeration', () => {
      const filter = new GlobalExceptionFilter();
      let responseJson: Record<string, unknown> = {};
      let responseStatus = 0;

      const mockResponse = {
        status: (s: number) => {
          responseStatus = s;
          return {
            json: (payload: Record<string, unknown>) => {
              responseJson = payload;
            },
          };
        },
      };

      const mockHost = {
        switchToHttp: () => ({
          getResponse: () => mockResponse,
          getRequest: () => ({ url: '/api/v1/auth/login', headers: {} }),
        }),
      };

      const {
        InvalidCredentialsException,
      } = require('../../identity/use-cases/exceptions/auth.exception');
      filter.catch(new InvalidCredentialsException(), mockHost as any);

      expect(responseStatus).toBe(HttpStatus.UNAUTHORIZED);
      expect((responseJson as any).error.message).toBe('Invalid email or password.');
    });
  });

  // ============================================================================
  // 2. API Security & HTTP Headers
  // ============================================================================
  describe('2. API Security & HTTP Defensive Headers', () => {
    it('verifies OWASP helmet configuration enforces strict frame, MIME, and CSP directives', () => {
      expect((helmetSecurityOptions.frameguard as any)?.action).toBe('deny');
      expect(helmetSecurityOptions.noSniff).toBe(true);
      expect(helmetSecurityOptions.hidePoweredBy).toBe(true);
      expect((helmetSecurityOptions.hsts as any)?.maxAge).toBe(31536000);
      expect((helmetSecurityOptions.contentSecurityPolicy as any)?.directives?.objectSrc).toEqual([
        "'none'",
      ]);
      expect((helmetSecurityOptions.contentSecurityPolicy as any)?.directives?.frameSrc).toEqual([
        "'none'",
      ]);
    });

    it('verifies GlobalSanitizationValidationPipe strips non-whitelisted mass-assignment fields and sanitizes XSS', async () => {
      class SampleDto {
        @IsString()
        allowedField!: string;
      }

      const pipe = new GlobalSanitizationValidationPipe();

      // Non-whitelisted object properties are rejected to prevent mass-assignment
      const massAssignmentPayload = {
        allowedField: 'Valid Data',
        maliciousAdminFlag: true,
      };

      await expect(
        pipe.transform(massAssignmentPayload, { type: 'body', metatype: SampleDto }),
      ).rejects.toThrow();

      // String values are sanitized of XSS vectors
      const xssPayload = {
        allowedField: '<script>alert(1)</script>Safe Data',
      };
      const sanitized = (await pipe.transform(xssPayload, {
        type: 'body',
        metatype: SampleDto,
      })) as SampleDto;

      expect(sanitized.allowedField).toBe('Safe Data');
    });
  });

  // ============================================================================
  // 3. Frontend Security Boundaries & Secret Leak Prevention
  // ============================================================================
  describe('3. Frontend Security Boundaries & Secret Exposure Prevention', () => {
    it('throws a security exception if server-side secrets are leaked into client environment', () => {
      const maliciousClientEnv = {
        VITE_APP_TITLE: 'Kinergy Web',
        DATABASE_URL: 'postgresql://kinergy_app:secret@localhost:5432/kinergy', // VIOLATION!
      };

      expect(() => checkForbiddenSecrets(maliciousClientEnv)).toThrow(
        /SECURITY VIOLATION: Server-side secrets detected in frontend environment configuration/i,
      );
    });

    it('permits clean client environment variables without forbidden server keys', () => {
      const cleanClientEnv = {
        VITE_APP_TITLE: 'Kinergy Web',
        VITE_API_BASE_URL: '/api/v1',
      };

      expect(() => checkForbiddenSecrets(cleanClientEnv)).not.toThrow();
    });
  });

  // ============================================================================
  // 4. Object Storage & Media Security
  // ============================================================================
  describe('4. Object Storage & Private-by-Default File Security', () => {
    it('generates secure tenant-isolated object keys rejecting path traversal vectors', () => {
      const key = StorageKeyUtil.generateObjectKey('tenant_corp_1', 'clinical', 'patient_eval.pdf');
      expect(key.startsWith('tenants/tenant_corp_1/clinical/')).toBe(true);
      expect(key.endsWith('.pdf')).toBe(true);

      // Path traversal attempts must be strictly rejected
      expect(() =>
        StorageKeyUtil.assertTenantOwnsKey('tenant_corp_1', 'tenants/../../etc/passwd'),
      ).toThrow();
      expect(() =>
        StorageKeyUtil.assertTenantOwnsKey('tenant_corp_1', 'tenants/tenant_1/../../../app/config'),
      ).toThrow();
      expect(() =>
        StorageKeyUtil.assertTenantOwnsKey(
          'tenant_corp_1',
          'tenants/attacker_tenant/clinical/doc.pdf',
        ),
      ).toThrow();
    });

    it('StorageController rejects unauthorized download requests missing security tokens', async () => {
      const mockStorageService = {} as MediaStorageService;
      const controller = new StorageController(mockStorageService);

      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      };

      await expect(
        controller.serveLocalFile('tenants/tenant_1/media/image.png', '', mockRes as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ============================================================================
  // 5. Database & Infrastructure Security
  // ============================================================================
  describe('5. Database & Infrastructure Least-Privilege Enforcement', () => {
    it('env.validation strictly rejects localhost DATABASE_URL in production mode (SEC-03)', () => {
      const prodLocalhostEnv = {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://kinergy_app:secret@localhost:5432/kinergy',
        JWT_ACCESS_SECRET: 'a_very_long_production_secure_secret_32_characters_min!',
        JWT_REFRESH_SECRET: 'another_very_long_secure_secret_32_characters_minimum!',
      };

      expect(() => validateEnv(prodLocalhostEnv)).toThrow(/non-localhost remote database host/i);
    });

    it('verifies staging PostgreSQL engine blocks application runtime role from DDL (42501)', async () => {
      if (!isDbAvailable) return;

      const appPrisma = StagingTestHelper.createClient(StagingTestHelper.getStagingAppUrl());
      try {
        // 1. Verify application runtime role connects and queries successfully
        const ping = await appPrisma.$queryRawUnsafe('SELECT 1 as result');
        expect(Array.isArray(ping)).toBe(true);

        // 2. Verify application runtime role is denied DDL permissions by PostgreSQL engine (42501)
        await expect(
          appPrisma.$executeRawUnsafe('CREATE TABLE security_ddl_breach_probe (id int)'),
        ).rejects.toThrow(/permission denied for schema public|42501/i);
      } finally {
        await appPrisma.$disconnect().catch(() => {});
      }
    });
  });

  // ============================================================================
  // 6. Health & Readiness Probes (Process vs Database Dependency)
  // ============================================================================
  describe('6. Operational Health & Readiness Probes', () => {
    it('Liveness probe returns 200 OK without executing database queries', () => {
      const controller = new AppController();
      const liveness = controller.getLiveness();

      expect(liveness.status).toBe('ok');
      expect(typeof liveness.uptime).toBe('number');
      expect(typeof liveness.timestamp).toBe('string');
      // Must not disclose internal credentials or database structure
      expect((liveness as any).database).toBeUndefined();
    });

    it('Readiness probe returns 503 Service Unavailable when database connection times out', async () => {
      const mockPrisma = {
        $queryRawUnsafe: jest.fn().mockRejectedValue(new Error('Connection timeout')),
      };

      const controller = new AppController(mockPrisma as any);
      await expect(controller.getReadiness()).rejects.toThrow(ServiceUnavailableException);
    });
  });

  // ============================================================================
  // 7. Logging & Sensitive Information Redaction
  // ============================================================================
  describe('7. Structured Logging & Sensitive Data Redaction', () => {
    it('redacts JWT tokens, credit card numbers, and connection strings from error log outputs', () => {
      const filter = new GlobalExceptionFilter();
      const sanitizeMethod = (filter as any).sanitizeMessage.bind(filter);

      const sensitiveLog =
        'Payment failed for card 4532-1234-5678-9012 with token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-ID and db postgresql://admin:super_secret_pw@db.staging:5432/main';

      const sanitized = sanitizeMethod(sensitiveLog);

      // Verify credit card is masked
      expect(sanitized).not.toContain('4532-1234-5678-9012');
      expect(sanitized).toContain('****-****-****-[MASKED]');

      // Verify JWT is redacted
      expect(sanitized).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      expect(sanitized).toContain('[REDACTED_TOKEN]');

      // Verify database credentials are wiped
      expect(sanitized).not.toContain('super_secret_pw');
      expect(sanitized).toContain('postgresql://[REDACTED_DATABASE_URL]');
    });

    it('replaces unhandled internal 500 errors with safe generic message in production', () => {
      const filter = new GlobalExceptionFilter();
      let responseJson: Record<string, unknown> = {};
      let responseStatus = 0;

      const mockResponse = {
        status: (s: number) => {
          responseStatus = s;
          return {
            json: (payload: Record<string, unknown>) => {
              responseJson = payload;
            },
          };
        },
      };

      const mockHost = {
        switchToHttp: () => ({
          getResponse: () => mockResponse,
          getRequest: () => ({ url: '/api/v1/clinical/sessions', headers: {} }),
        }),
      };

      // Unhandled fatal error with sensitive SQL/stack details
      const unhandledError = new Error(
        'SELECT * FROM clinical_notes WHERE diagnosis = "Depression" FAILED: syntax error',
      );
      filter.catch(unhandledError, mockHost as any);

      expect(responseStatus).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      // Response must NOT contain internal SQL or patient diagnosis
      expect((responseJson as any).error.message).toBe('Internal server error');
      expect(JSON.stringify(responseJson)).not.toContain('Depression');
      expect(JSON.stringify(responseJson)).not.toContain('SELECT * FROM');
    });
  });
});
