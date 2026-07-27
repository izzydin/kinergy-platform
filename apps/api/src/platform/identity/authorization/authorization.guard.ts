import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import {
  AUTHORIZATION_SERVICE,
  IAuthorizationService,
  IPermissionResolver,
  PERMISSION_RESOLVER,
} from './authorization.interface';
import { ROLES_KEY } from './decorators/roles.decorator';
import { PERMISSIONS_KEY } from './decorators/permissions.decorator';

export interface RequestUserPayload {
  id: string;
  email: string;
  status: string;
  roles: string[];
  permissions: string[];
  tenantId?: string | null;
}

/**
 * NestJS Authorization Guard for Role and Permission Evaluation.
 * Reads metadata (@Roles, @Permissions) and delegates evaluation to IAuthorizationService and IPermissionResolver.
 */
@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTHORIZATION_SERVICE)
    private readonly authorizationService: IAuthorizationService,
    @Inject(PERMISSION_RESOLVER)
    private readonly permissionResolver: IPermissionResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Pass through if neither roles nor permissions are specified on route/controller
    if (
      (!requiredRoles || requiredRoles.length === 0) &&
      (!requiredPermissions || requiredPermissions.length === 0)
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const userPayload = (request as unknown as { user?: RequestUserPayload }).user;

    if (!userPayload) {
      throw new UnauthorizedException('Authentication required before authorization check.');
    }

    // Resolve comprehensive user permissions via IPermissionResolver
    const resolvedPermissions = await this.permissionResolver.resolvePermissions(
      userPayload.id,
      userPayload.roles ?? [],
      userPayload.permissions ?? [],
      userPayload.tenantId,
    );

    const isAllowed = await this.authorizationService.isAuthorized({
      userId: userPayload.id,
      userRoles: userPayload.roles ?? [],
      userPermissions: resolvedPermissions,
      requiredRoles,
      requiredPermissions,
      tenantId: userPayload.tenantId,
    });

    if (!isAllowed) {
      throw new ForbiddenException('Access denied: insufficient permissions or roles.');
    }

    return true;
  }
}
