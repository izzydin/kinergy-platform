import { INestApplication, Controller, Get } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import helmet from 'helmet';
import { helmetSecurityOptions } from '../helmet/helmet-security.config';
import { SecurityHeadersMiddleware } from '../middleware/security-headers.middleware';

@Controller('api/v1')
class TestController {
  @Get('test')
  getTest() {
    return { ok: true };
  }
}

describe('HTTP Security Headers (Integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [TestController],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(helmet(helmetSecurityOptions));
    app.use(new SecurityHeadersMiddleware().use);
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('should include all required OWASP security HTTP headers on responses', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/test');

    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(response.headers['permissions-policy']).toContain('camera=()');
    expect(response.headers['x-permitted-cross-domain-policies']).toBe('none');
    expect(response.headers['x-download-options']).toBe('noopen');
    expect(response.headers['strict-transport-security']).toContain('max-age=31536000');
  });
});
