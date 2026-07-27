import { UnauthorizedException } from '@nestjs/common';
import { RequestContext } from '../../request-context';
import { AsyncLocalStorageRequestContextAccessor } from '../async-local-storage-request-context-accessor';
import { AuthenticatedUserContext } from '../authenticated-user-context';

describe('AsyncLocalStorageRequestContextAccessor', () => {
  let accessor: AsyncLocalStorageRequestContextAccessor;

  beforeEach(() => {
    accessor = new AsyncLocalStorageRequestContextAccessor();
  });

  it('should return null when no context is active', () => {
    expect(accessor.getContext()).toBeNull();
  });

  it('should throw UnauthorizedException on requireContext() when no context is active', () => {
    expect(() => accessor.requireContext()).toThrow(UnauthorizedException);
  });

  it('should retrieve active AuthenticatedUserContext within RequestContext.run execution chain', async () => {
    const userContext = new AuthenticatedUserContext({
      userId: 'usr_1',
      email: 'active@example.com',
      status: 'ACTIVE',
      roles: ['USER'],
      permissions: ['read:profile'],
      tenantId: 'tenant_1',
    });

    await RequestContext.run(userContext, async () => {
      const activeContext = accessor.getContext();
      expect(activeContext).toBeDefined();
      expect(activeContext?.userId).toBe('usr_1');
      expect(accessor.requireContext().userId).toBe('usr_1');
    });
  });
});
