import { Injectable, UnauthorizedException } from '@nestjs/common';
import { RequestContext } from '../request-context';
import { AuthenticatedUserContext } from './authenticated-user-context';
import { IRequestContextAccessor } from './request-context-accessor.interface';

/**
 * Node.js AsyncLocalStorage implementation of IRequestContextAccessor.
 * Exposes active AuthenticatedUserContext across call stacks without parameter passing.
 */
@Injectable()
export class AsyncLocalStorageRequestContextAccessor implements IRequestContextAccessor {
  getContext(): AuthenticatedUserContext | null {
    return RequestContext.currentContext();
  }

  requireContext(): AuthenticatedUserContext {
    const context = this.getContext();
    if (!context) {
      throw new UnauthorizedException('No active authenticated request context found.');
    }
    return context;
  }
}
