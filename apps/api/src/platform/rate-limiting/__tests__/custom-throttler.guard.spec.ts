import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerException, ThrottlerStorage } from '@nestjs/throttler';
import { CustomThrottlerGuard } from '../guards/custom-throttler.guard';
import { IAccessTokenService } from '../../identity/tokens/access-token.service';

describe('CustomThrottlerGuard', () => {
  let guard: CustomThrottlerGuard;
  let mockAccessTokenService: jest.Mocked<IAccessTokenService>;

  beforeEach(() => {
    const mockStorage = {
      increment: jest.fn(),
    } as unknown as ThrottlerStorage;

    const mockReflector = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as Reflector;

    mockAccessTokenService = {
      generateToken: jest.fn(),
      validateToken: jest.fn(),
    };

    guard = new CustomThrottlerGuard(
      {
        throttlers: [{ name: 'default', ttl: 60000, limit: 120 }],
      },
      mockStorage,
      mockReflector,
      mockAccessTokenService,
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
        limit: 120,
        ttl: 60000,
        key: 'test_key',
        tracker: '127.0.0.1',
        totalHits: 121,
        timeToExpire: 50,
      }),
    ).rejects.toThrow(
      new ThrottlerException('Too many requests. Please slow down and try again later.'),
    );
  });

  describe('getTracker', () => {
    it('should track by user ID when req.user has userId', async () => {
      const req = {
        user: { userId: 'usr_abc123' },
        headers: {},
        ip: '192.168.1.50',
      };

      const tracker = await guard['getTracker'](req);
      expect(tracker).toBe('user:usr_abc123');
    });

    it('should track by user ID when valid Bearer token is provided', async () => {
      mockAccessTokenService.validateToken.mockResolvedValueOnce({
        sub: 'usr_verified_789',
        email: 'user@kinergy.test',
        roles: ['STAFF'],
        permissions: [],
        tokenVersion: 1,
      });

      const req = {
        headers: {
          authorization: 'Bearer valid-jwt-token',
        },
        ip: '192.168.1.50',
      };

      const tracker = await guard['getTracker'](req);
      expect(tracker).toBe('user:usr_verified_789');
      expect(mockAccessTokenService.validateToken).toHaveBeenCalledWith('valid-jwt-token');
    });

    it('should fall back to real client IP from req.ips[0] behind reverse proxy when unauthenticated', async () => {
      const req = {
        headers: {},
        ips: ['203.0.113.195', '172.18.0.2'],
        ip: '172.18.0.2',
      };

      const tracker = await guard['getTracker'](req);
      expect(tracker).toBe('ip:203.0.113.195');
    });

    it('should fall back to req.ip when req.ips is empty and unauthenticated', async () => {
      const req = {
        headers: {},
        ips: [],
        ip: '198.51.100.42',
      };

      const tracker = await guard['getTracker'](req);
      expect(tracker).toBe('ip:198.51.100.42');
    });

    it('should fall back to IP when Bearer token validation fails', async () => {
      mockAccessTokenService.validateToken.mockResolvedValueOnce(null);

      const req = {
        headers: {
          authorization: 'Bearer expired-or-invalid-jwt',
        },
        ip: '198.51.100.42',
      };

      const tracker = await guard['getTracker'](req);
      expect(tracker).toBe('ip:198.51.100.42');
    });
  });
});
