import { SkipThrottle as NestSkipThrottle, Throttle } from '@nestjs/throttler';

/**
 * Decorator enforcing rate limits on Login endpoints (5 reqs / 60s per client/IP default).
 */
export const LoginThrottle = () => Throttle({ default: { ttl: 60000, limit: 5 } });

/**
 * Decorator enforcing rate limits on Refresh Token endpoints (20 reqs / 60s per client/IP default).
 */
export const RefreshThrottle = () => Throttle({ default: { ttl: 60000, limit: 20 } });

/**
 * Decorator enforcing rate limits on Logout endpoints (30 reqs / 60s per client/IP default).
 */
export const LogoutThrottle = () => Throttle({ default: { ttl: 60000, limit: 30 } });

/**
 * Decorator enforcing rate limits on Current User /me endpoints (60 reqs / 60s per client/IP default).
 */
export const MeThrottle = () => Throttle({ default: { ttl: 60000, limit: 60 } });

/**
 * Decorator marking endpoints (such as health checks) to bypass rate-limiting.
 */
export const SkipThrottle = NestSkipThrottle;
