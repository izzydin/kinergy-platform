import { NavigationBuilder } from '../navigation.builder';
import { defaultNavigationItems } from '../navigation.config';
import type { NavigationItem } from '../navigation.types';

describe('NavigationBuilder & Authoritative Navigation Registry', () => {
  describe('Authoritative Route Inventory & Baseline Configuration', () => {
    it('contains authoritative, deduplicated navigation items for completed modules', () => {
      const paths = defaultNavigationItems.map((item) => item.path);
      const ids = defaultNavigationItems.map((item) => item.id);

      // Must contain authoritative routes
      expect(paths).toContain('/dashboard');
      expect(paths).toContain('/clients');
      expect(paths).toContain('/gym');
      expect(paths).toContain('/attendance');
      expect(paths).toContain('/sales');
      expect(paths).toContain('/resources/overview');
      expect(paths).toContain('/admin/users');
      expect(paths).toContain('/settings');

      // Must NOT contain dead or obsolete routes
      expect(paths).not.toContain('/admin'); // Dead route replaced by /admin/users
      expect(paths).not.toContain('/'); // Consolidated into /dashboard
      expect(paths).not.toContain('/energy');
      expect(paths).not.toContain('/analytics');
      expect(paths).not.toContain('/dashboard/ui-states');

      // Unique IDs
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('assigns correct requiredPermissions to secured feature modules', () => {
      const gymItem = defaultNavigationItems.find((i) => i.id === 'gym');
      const attendanceItem = defaultNavigationItems.find((i) => i.id === 'attendance');
      const salesItem = defaultNavigationItems.find((i) => i.id === 'sales');
      const userMgmtItem = defaultNavigationItems.find((i) => i.id === 'user-management');
      const resourcesItem = defaultNavigationItems.find((i) => i.id === 'resources');
      const dashboardItem = defaultNavigationItems.find((i) => i.id === 'dashboard');

      expect(gymItem?.requiredPermissions).toEqual(['memberships.read']);
      expect(attendanceItem?.requiredPermissions).toEqual(['gym.attendance.read']);
      expect(salesItem?.requiredPermissions).toEqual(['sales.read']);
      expect(userMgmtItem?.requiredPermissions).toEqual(['manage:users']);
      expect(resourcesItem?.requiredPermissions).toEqual(['inventory.read', 'assets.read']);
      expect(dashboardItem?.requiredPermissions).toBeUndefined();
    });
  });

  describe('Permission-Aware Navigation Filtering', () => {
    it('filters out restricted navigation items when user has no permissions', () => {
      const sections = NavigationBuilder.build({
        items: defaultNavigationItems,
        hasPermission: () => false,
      });

      const allItems = sections.flatMap((s) => s.items);
      const paths = allItems.map((i) => i.path);

      // Only unrestricted items should be visible
      expect(paths).toContain('/dashboard');
      expect(paths).toContain('/settings');

      // Restricted items must be hidden
      expect(paths).not.toContain('/gym');
      expect(paths).not.toContain('/attendance');
      expect(paths).not.toContain('/sales');
      expect(paths).not.toContain('/clients');
      expect(paths).not.toContain('/resources/overview');
      expect(paths).not.toContain('/admin/users');
    });

    it('exposes only the specific items granted by user permissions', () => {
      const userPermissions = new Set(['memberships.read', 'gym.attendance.read']);

      const sections = NavigationBuilder.build({
        items: defaultNavigationItems,
        hasPermission: (perm) => userPermissions.has(perm),
      });

      const allItems = sections.flatMap((s) => s.items);
      const paths = allItems.map((i) => i.path);

      expect(paths).toContain('/dashboard');
      expect(paths).toContain('/gym');
      expect(paths).toContain('/attendance');
      expect(paths).toContain('/settings');

      expect(paths).not.toContain('/sales');
      expect(paths).not.toContain('/admin/users');
      expect(paths).not.toContain('/clients');
    });

    it('exposes admin section and user management only to users with manage:users permission', () => {
      const sectionsWithout = NavigationBuilder.build({
        items: defaultNavigationItems,
        hasPermission: () => false,
      });
      expect(sectionsWithout.find((s) => s.id === 'admin')).toBeUndefined();

      const sectionsWith = NavigationBuilder.build({
        items: defaultNavigationItems,
        hasPermission: (perm) => perm === 'manage:users',
      });
      const adminSection = sectionsWith.find((s) => s.id === 'admin');
      expect(adminSection).toBeDefined();
      expect(adminSection?.items.map((i) => i.path)).toEqual(['/admin/users']);
    });
  });

  describe('Section Ordering and Item Weighting', () => {
    it('orders sections logically: overview -> core -> admin -> system', () => {
      const sections = NavigationBuilder.build({
        items: defaultNavigationItems,
        hasPermission: () => true,
      });

      const sectionIds = sections.map((s) => s.id);
      expect(sectionIds).toEqual(['overview', 'core', 'admin', 'system']);
    });

    it('sorts items within sections by order weight', () => {
      const sections = NavigationBuilder.build({
        items: defaultNavigationItems,
        hasPermission: () => true,
      });

      const coreSection = sections.find((s) => s.id === 'core');
      const coreOrders = coreSection?.items.map((i) => i.order ?? 100) ?? [];

      for (let i = 1; i < coreOrders.length; i++) {
        const prev = coreOrders[i - 1] ?? 0;
        const curr = coreOrders[i] ?? 0;
        expect(curr).toBeGreaterThanOrEqual(prev);
      }
    });

    it('filters items requiring disabled tenant feature flags', () => {
      const customItems: NavigationItem[] = [
        {
          id: 'feature-a',
          label: 'Feature A',
          path: '/feature-a',
          requiredTenantFeatures: ['flag_alpha'],
        },
        {
          id: 'feature-b',
          label: 'Feature B',
          path: '/feature-b',
        },
      ];

      const sections = NavigationBuilder.build({
        items: customItems,
        hasTenantFeature: (flag) => flag !== 'flag_alpha',
      });

      const paths = sections.flatMap((s) => s.items).map((i) => i.path);
      expect(paths).not.toContain('/feature-a');
      expect(paths).toContain('/feature-b');
    });
  });
});
