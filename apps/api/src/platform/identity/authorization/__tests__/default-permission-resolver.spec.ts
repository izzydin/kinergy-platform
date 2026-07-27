import { DefaultPermissionResolver } from '../default-permission-resolver';

describe('DefaultPermissionResolver', () => {
  let resolver: DefaultPermissionResolver;

  beforeEach(() => {
    resolver = new DefaultPermissionResolver();
  });

  it('should consolidate and deduplicate direct permissions', async () => {
    const directPermissions = ['read:users', 'write:users', 'read:users'];

    const resolved = await resolver.resolvePermissions('usr_1', ['USER'], directPermissions);

    expect(resolved).toEqual(['read:users', 'write:users']);
  });
});
