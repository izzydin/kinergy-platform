import { Inject, Injectable } from '@nestjs/common';
import { AuthenticatedUserContext } from '../context/authenticated-user-context';
import {
  AUTHORIZATION_EVALUATOR,
  IAuthorizationEvaluator,
} from './authorization-evaluator.interface';
import { AuthorizationContext, IAuthorizationService } from './authorization.interface';
import { AuthorizationRequirements } from './models/authorization-requirements.model';

/**
 * Adapter implementation of IAuthorizationService delegating policy decisions to IAuthorizationEvaluator.
 */
@Injectable()
export class DefaultAuthorizationService implements IAuthorizationService {
  constructor(
    @Inject(AUTHORIZATION_EVALUATOR)
    private readonly evaluator: IAuthorizationEvaluator,
  ) {}

  async isAuthorized(context: AuthorizationContext): Promise<boolean> {
    const userContext = new AuthenticatedUserContext({
      userId: context.userId,
      email: '',
      status: 'ACTIVE',
      roles: context.userRoles,
      permissions: context.userPermissions,
      tenantId: context.tenantId,
    });

    const requirements = new AuthorizationRequirements({
      requiredRoles: context.requiredRoles,
      requiredPermissions: context.requiredPermissions,
      tenantId: context.tenantId,
    });

    const decision = await this.evaluator.evaluate(userContext, requirements);
    return decision.isAuthorized;
  }
}
