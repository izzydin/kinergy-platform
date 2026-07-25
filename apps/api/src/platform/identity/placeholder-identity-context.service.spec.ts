import { PlaceholderIdentityContextService } from './placeholder-identity-context.service';
import { RequestContext } from './request-context';
import { IUserIdentity } from './user-identity.interface';

describe('PlaceholderIdentityContextService', () => {
  let service: PlaceholderIdentityContextService;

  beforeEach(() => {
    service = new PlaceholderIdentityContextService();
  });

  it('should return default fallback identity when no RequestContext is active', () => {
    const user = service.getCurrentUser();
    expect(user).toBeDefined();
    expect(user?.userId).toBe('system-placeholder-user-id');
    expect(user?.roles).toContain('Owner');
    expect(user?.permissions).toContain('*:*:*');
    expect(user?.tenantId).toBe('system-placeholder-tenant-id');
  });

  it('should return active RequestContext identity when wrapped in RequestContext.run()', () => {
    const customUser: IUserIdentity = {
      userId: 'custom-user-123',
      email: 'trainer@kinergy.platform',
      roles: ['Trainer'],
      permissions: ['clients.read', 'appointments.read'],
      tenantId: 'tenant-abc-789',
    };

    RequestContext.run(customUser, () => {
      const activeUser = service.getCurrentUser();
      expect(activeUser).toEqual(customUser);
      expect(activeUser?.permissions).toContain('clients.read');
      expect(activeUser?.tenantId).toBe('tenant-abc-789');
    });
  });

  it('should indicate user is authenticated', () => {
    expect(service.isAuthenticated()).toBe(true);
  });
});
