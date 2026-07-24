import { PlaceholderIdentityContextService } from './placeholder-identity-context.service';

describe('PlaceholderIdentityContextService', () => {
  let service: PlaceholderIdentityContextService;

  beforeEach(() => {
    service = new PlaceholderIdentityContextService();
  });

  it('should return default placeholder identity', () => {
    const user = service.getCurrentUser();
    expect(user).toBeDefined();
    expect(user?.userId).toBe('system-placeholder-user-id');
    expect(user?.roles).toContain('SYSTEM_ADMIN');
  });

  it('should indicate user is authenticated', () => {
    expect(service.isAuthenticated()).toBe(true);
  });
});
