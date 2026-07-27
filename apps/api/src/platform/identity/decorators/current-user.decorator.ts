import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { RequestContext } from '../request-context';

export interface AuthenticatedUserPayload {
  id: string;
  email: string;
  status: string;
  roles: string[];
  permissions: string[];
  tenantId?: string | null;
}

/**
 * Parameter decorator extracting the currently authenticated user's identity payload.
 * Supports property key extraction (e.g. @CurrentUser('id'), @CurrentUser('email')).
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUserPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const reqUser = (request as unknown as { user?: AuthenticatedUserPayload }).user;
    const asyncUser = RequestContext.currentIdentity();

    const user: AuthenticatedUserPayload | null = reqUser
      ? reqUser
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

    if (!user) {
      return null;
    }

    return data ? user[data] : user;
  },
);
