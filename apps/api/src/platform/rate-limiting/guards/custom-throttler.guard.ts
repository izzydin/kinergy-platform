import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerException, ThrottlerGuard } from '@nestjs/throttler';

type ThrottlerLimitDetailParam = Parameters<ThrottlerGuard['throwThrottlingException']>[1];

/**
 * Custom Throttler Guard extending NestJS ThrottlerGuard.
 * Intercepts rate limit breaches and throws standardized HTTP 429 Too Many Requests exceptions.
 * Framework-isolated transport guard acting as the application's last line of defense behind edge gateways.
 */
@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected override async throwThrottlingException(
    _context: ExecutionContext,
    _details?: ThrottlerLimitDetailParam,
  ): Promise<void> {
    throw new ThrottlerException('Too many requests. Please slow down and try again later.');
  }
}
