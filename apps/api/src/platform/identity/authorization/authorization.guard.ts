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
import { AuthenticatedUserContext } from '../context/authenticated-user-context';
import { RequestContext } from '../request-context';
import {
  AUTHORIZATION_EVALUATOR,
  IAuthorizationEvaluator,
} from './authorization-evaluator.interface';
import { AuthorizationRequirements } from './models/authorization-requirements.model';
import { ROLES_KEY } from './decorators/roles.decorator';
import { PERMISSIONS_KEY } from './decorators/permissions.decorator';

/**
 * Thin NestJS Authorization Guard for HTTP Transport Orchestration.
 * Reads route metadata (@Roles, @Permissions), extracts AuthenticatedUserContext,
 * and delegates policy evaluation to IAuthorizationEvaluator.
 * Contains zero authorization decision logic.
 */
@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTHORIZATION_EVALUATOR)
    private readonly evaluator: IAuthorizationEvaluator,
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

    const requirements = new AuthorizationRequirements({
      requiredRoles,
      requiredPermissions,
    });

    if (!requirements.hasRequirements()) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const reqUser = (
      request as unknown as { user?: AuthenticatedUserContext | Record<string, unknown> }
    ).user;

    let userContext: AuthenticatedUserContext | null = null;
    if (reqUser instanceof AuthenticatedUserContext) {
      userContext = reqUser;
    } else if (reqUser && typeof reqUser === 'object' && ('userId' in reqUser || 'id' in reqUser)) {
      const rawUser = reqUser as Record<string, unknown>;
      const rawId = rawUser.userId ?? rawUser.id;
      const userId = typeof rawId === 'string' ? rawId.trim() : '';
      if (userId) {
        userContext = new AuthenticatedUserContext({
          userId,
          email: typeof rawUser.email === 'string' ? rawUser.email : '',
          status: typeof rawUser.status === 'string' ? rawUser.status : 'ACTIVE',
          roles: Array.isArray(rawUser.roles) ? (rawUser.roles as string[]) : [],
          permissions: Array.isArray(rawUser.permissions) ? (rawUser.permissions as string[]) : [],
          tenantId: typeof rawUser.tenantId === 'string' ? rawUser.tenantId : null,
        });
      }
    } else {
      userContext = RequestContext.currentContext();
    }

    if (!userContext || !userContext.userId || userContext.userId.trim() === '') {
      throw new UnauthorizedException('Authentication required before authorization check.');
    }

    if (userContext.status && userContext.status !== 'ACTIVE') {
      throw new UnauthorizedException('User account is inactive or disabled.');
    }

    const decision = await this.evaluator.evaluate(userContext, requirements);

    if (!decision.isAuthorized) {
      throw new ForbiddenException(decision.reason ?? 'Access denied: insufficient privileges.');
    }

    return true;
  }
}
