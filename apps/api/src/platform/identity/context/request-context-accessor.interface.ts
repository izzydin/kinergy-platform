import { AuthenticatedUserContext } from './authenticated-user-context';

/**
 * Port interface for retrieving the active AuthenticatedUserContext across application services.
 * Decouples use cases and infrastructure services from framework request objects.
 */
export interface IRequestContextAccessor {
  getContext(): AuthenticatedUserContext | null;
  requireContext(): AuthenticatedUserContext;
}

export const REQUEST_CONTEXT_ACCESSOR = Symbol('IRequestContextAccessor');
