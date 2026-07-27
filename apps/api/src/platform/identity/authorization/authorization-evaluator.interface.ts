import { AuthenticatedUserContext } from '../context/authenticated-user-context';
import { AuthorizationDecision } from './models/authorization-decision.model';
import { AuthorizationRequirements } from './models/authorization-requirements.model';

/**
 * Single source of truth for authorization decisions across application boundaries.
 * Evaluates whether an authenticated user context satisfies specified authorization requirements.
 * Framework-independent (zero NestJS/HTTP concepts).
 */
export interface IAuthorizationEvaluator {
  evaluate(
    userContext: AuthenticatedUserContext,
    requirements: AuthorizationRequirements,
  ): Promise<AuthorizationDecision>;
}

export const AUTHORIZATION_EVALUATOR = Symbol('IAuthorizationEvaluator');
