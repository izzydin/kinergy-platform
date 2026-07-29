import {
  INestApplication,
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseFilters,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { LoginUseCase } from '../use-cases/login.use-case';
import { GlobalExceptionFilter } from '../../../common/filters/global-exception.filter';
import { InvalidCredentialsException } from '../use-cases/exceptions/auth.exception';

@Controller('api/v1/auth')
@UseFilters(GlobalExceptionFilter)
class TestAuthController {
  constructor(private readonly loginUseCase: LoginUseCase) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: Record<string, unknown>) {
    return this.loginUseCase.execute(body as unknown as Parameters<LoginUseCase['execute']>[0]);
  }
}

describe('Authentication Hardening (Information Disclosure & Generic Error Response Integration)', () => {
  let app: INestApplication;
  let mockLoginUseCase: jest.Mocked<LoginUseCase>;

  beforeAll(async () => {
    mockLoginUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<LoginUseCase>;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [TestAuthController],
      providers: [
        {
          provide: LoginUseCase,
          useValue: mockLoginUseCase,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('should return identical HTTP 401 Unauthorized response for non-existent email', async () => {
    mockLoginUseCase.execute.mockRejectedValue(new InvalidCredentialsException());

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'nonexistent@example.com', password: 'Password123!' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      statusCode: 401,
      timestamp: expect.any(String),
      path: '/api/v1/auth/login',
      error: {
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid email or password.',
      },
    });
  });

  it('should return identical HTTP 401 Unauthorized response for invalid password', async () => {
    mockLoginUseCase.execute.mockRejectedValue(new InvalidCredentialsException());

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'validuser@example.com', password: 'WrongPassword!' });

    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe('Invalid email or password.');
  });

  it('should return identical HTTP 401 Unauthorized response for blocked user status', async () => {
    mockLoginUseCase.execute.mockRejectedValue(new InvalidCredentialsException());

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'blocked@example.com', password: 'Password123!' });

    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe('Invalid email or password.');
  });
});
