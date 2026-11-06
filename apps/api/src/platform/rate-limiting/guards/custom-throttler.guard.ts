import { ExecutionContext, Inject, Injectable, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerException,
  ThrottlerGuard,
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';
import {
  ACCESS_TOKEN_SERVICE,
  IAccessTokenService,
} from '../../identity/tokens/access-token.service';

type ThrottlerLimitDetailParam = Parameters<ThrottlerGuard['throwThrottlingException']>[1];

/**
 * Custom Throttler Guard extending NestJS ThrottlerGuard.
 * Intercepts rate limit breaches and throws standardized HTTP 429 Too Many Requests exceptions.
 * Features:
 * - User-aware tracking: Tracks authenticated users by user ID (user:<id>), avoiding IP collision behind NAT/proxies.
 * - Reverse-proxy aware: Resolves real client IP using Express req.ips / req.ip when running behind Nginx.
 * - Fallback to IP tracking (ip:<client-ip>) for unauthenticated requests.
 * - Standardized 429 JSON response with Retry-After header.
 */
@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions()
    options: ThrottlerModuleOptions,
    @InjectThrottlerStorage()
    storageService: ThrottlerStorage,
    reflector: Reflector,
    @Optional()
    @Inject(ACCESS_TOKEN_SERVICE)
    private readonly accessTokenService?: IAccessTokenService,
  ) {
    super(options, storageService, reflector);
  }

  /**
   * Resolves rate-limit tracking identifier.
   * If the request is authenticated (via user context or verified Bearer token), tracks by user ID.
   * Otherwise, tracks by the client IP address (supporting proxy headers).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected override async getTracker(req: Record<string, any>): Promise<string> {
    // 1. If an authenticated user context is already present on the request
    if (req.user?.userId) {
      return `user:${req.user.userId}`;
    }

    // 2. If Bearer token is provided in Authorization header, cryptographically verify and extract subject ID
    const authHeader = req.headers?.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      if (token && this.accessTokenService) {
        try {
          const payload = await this.accessTokenService.validateToken(token);
          if (payload?.sub) {
            return `user:${payload.sub}`;
          }
        } catch {
          // Token invalid or expired - proceed to IP fallback
        }
      }
    }

    // 3. Fallback to IP address (supports Express trust proxy req.ips)
    const clientIp =
      (Array.isArray(req.ips) && req.ips.length > 0 ? req.ips[0] : null) ||
      req.ip ||
      req.socket?.remoteAddress ||
      'unknown-ip';

    return `ip:${clientIp}`;
  }

  protected override async throwThrottlingException(
    _context: ExecutionContext,
    _details?: ThrottlerLimitDetailParam,
  ): Promise<void> {
    throw new ThrottlerException('Too many requests. Please slow down and try again later.');
  }
}
