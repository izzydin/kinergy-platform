import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import { RequestContext } from '../../../platform/identity/request-context';
import { AuthenticatedUserPayload } from '../../../platform/identity/decorators/current-user.decorator';

/**
 * Trusted execution context for AI conversation operations.
 * Guaranteed to be securely extracted from verified authentication tokens and session contexts.
 */
export interface TrustedAiContext {
  readonly actorId: string;
  readonly tenantId: string;
  readonly email?: string;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
}

/**
 * Parameter decorator that extracts trusted tenant and actor identity from the authenticated request.
 *
 * Security Guarantees:
 * - Strictly ignores client-submitted tenantId or userId in bodies, queries, or arbitrary headers.
 * - Throws UnauthorizedException if the request has no valid authenticated principal.
 * - Throws ForbiddenException if the authenticated principal has no assigned tenant ID.
 * - Extracts roles and permissions for downstream authorization enforcement.
 */
export const TrustedAi = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TrustedAiContext => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const reqUser = (request as unknown as { user?: AuthenticatedUserPayload }).user;
    const asyncUser = RequestContext.currentIdentity();

    const user: AuthenticatedUserPayload | null = reqUser
      ? {
          id: reqUser.id || reqUser.userId || '',
          email: reqUser.email ?? '',
          status: reqUser.status ?? 'ACTIVE',
          roles: Array.isArray(reqUser.roles) ? [...reqUser.roles] : [],
          permissions: Array.isArray(reqUser.permissions) ? [...reqUser.permissions] : [],
          tenantId: reqUser.tenantId ?? null,
        }
      : asyncUser
        ? {
            id: asyncUser.userId,
            email: asyncUser.email ?? '',
            status: 'ACTIVE',
            roles: asyncUser.roles,
            permissions: asyncUser.permissions,
            tenantId: asyncUser.tenantId,
          }
        : null;

    if (!user || !user.id || user.id.trim().length === 0) {
      throw new UnauthorizedException('Authentication context is missing or invalid.');
    }

    if (!user.tenantId || user.tenantId.trim().length === 0) {
      throw new ForbiddenException('Tenant identification is required for AI operations.');
    }

    return {
      actorId: user.id.trim(),
      tenantId: user.tenantId.trim(),
      email: user.email,
      roles: user.roles,
      permissions: user.permissions,
    };
  },
);
