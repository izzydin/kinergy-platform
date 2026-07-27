import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerException, ThrottlerStorage } from '@nestjs/throttler';
import { CustomThrottlerGuard } from '../guards/custom-throttler.guard';

describe('CustomThrottlerGuard', () => {
  let guard: CustomThrottlerGuard;

  beforeEach(() => {
    const mockStorage = {
      increment: jest.fn(),
    } as unknown as ThrottlerStorage;

    const mockReflector = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as Reflector;

    guard = new CustomThrottlerGuard(
      {
        throttlers: [{ name: 'default', ttl: 60000, limit: 5 }],
      },
      mockStorage,
      mockReflector,
    );
  });

  it('should throw standardized ThrottlerException when rate limit is exceeded', async () => {
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: {}, ip: '127.0.0.1' }),
        getResponse: () => ({ header: jest.fn() }),
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;

    const throwMethod = guard['throwThrottlingException'].bind(guard);

    await expect(
      throwMethod(mockContext, {
        limit: 5,
        ttl: 60000,
        key: 'test_key',
        tracker: '127.0.0.1',
        totalHits: 6,
        timeToExpire: 50,
      }),
    ).rejects.toThrow(ThrottlerException);
  });
});
