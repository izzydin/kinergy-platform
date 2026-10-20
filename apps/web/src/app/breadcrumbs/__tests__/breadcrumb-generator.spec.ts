import { BreadcrumbGenerator } from '../breadcrumb-generator';
import { defaultNavigationItems } from '../../navigation/navigation.config';

describe('BreadcrumbGenerator', () => {
  describe('Root Dashboard Breadcrumb Resolution', () => {
    it('produces single root breadcrumb for /dashboard without duplication', () => {
      const breadcrumbs = BreadcrumbGenerator.generate({
        pathname: '/dashboard',
        navigationItems: defaultNavigationItems,
      });

      expect(breadcrumbs).toHaveLength(1);
      expect(breadcrumbs[0]).toEqual(
        expect.objectContaining({
          id: 'root-home',
          label: 'Dashboard',
          path: '/dashboard',
          isCurrent: true,
        }),
      );
    });

    it('produces root breadcrumb when pathname is / (redirect target)', () => {
      const breadcrumbs = BreadcrumbGenerator.generate({
        pathname: '/',
        navigationItems: defaultNavigationItems,
      });

      expect(breadcrumbs).toHaveLength(1);
      expect(breadcrumbs[0]).toEqual(
        expect.objectContaining({
          id: 'root-home',
          label: 'Dashboard',
          path: '/dashboard',
          isCurrent: true,
        }),
      );
    });
  });

  describe('Feature Route Hierarchy & Segment Formatting', () => {
    it('generates breadcrumbs for /gym/memberships using registered navigation metadata', () => {
      const breadcrumbs = BreadcrumbGenerator.generate({
        pathname: '/gym/memberships',
        navigationItems: defaultNavigationItems,
      });

      expect(breadcrumbs).toHaveLength(3);
      expect(breadcrumbs[0]).toEqual(
        expect.objectContaining({
          label: 'Dashboard',
          path: '/dashboard',
          isCurrent: false,
        }),
      );
      expect(breadcrumbs[1]).toEqual(
        expect.objectContaining({
          label: 'Gym Operations',
          path: '/gym',
          isCurrent: false,
        }),
      );
      expect(breadcrumbs[2]).toEqual(
        expect.objectContaining({
          label: 'Memberships',
          path: '/gym/memberships',
          isCurrent: true,
        }),
      );
    });

    it('generates breadcrumbs for /attendance using registered navigation metadata', () => {
      const breadcrumbs = BreadcrumbGenerator.generate({
        pathname: '/attendance',
        navigationItems: defaultNavigationItems,
      });

      expect(breadcrumbs).toHaveLength(2);
      expect(breadcrumbs[0]).toEqual(
        expect.objectContaining({
          label: 'Dashboard',
          path: '/dashboard',
          isCurrent: false,
        }),
      );
      expect(breadcrumbs[1]).toEqual(
        expect.objectContaining({
          label: 'Attendance & Check-In',
          path: '/attendance',
          isCurrent: true,
        }),
      );
    });

    it('generates breadcrumbs for /admin/users', () => {
      const breadcrumbs = BreadcrumbGenerator.generate({
        pathname: '/admin/users',
        navigationItems: defaultNavigationItems,
      });

      expect(breadcrumbs).toHaveLength(3);
      expect(breadcrumbs[0]).toEqual(
        expect.objectContaining({
          label: 'Dashboard',
          path: '/dashboard',
          isCurrent: false,
        }),
      );
      expect(breadcrumbs[1]).toEqual(
        expect.objectContaining({
          label: 'Admin',
          path: '/admin',
          isCurrent: false,
        }),
      );
      expect(breadcrumbs[2]).toEqual(
        expect.objectContaining({
          label: 'User Management',
          path: '/admin/users',
          isCurrent: true,
        }),
      );
    });

    it('formats numeric identifiers into hash prefixes (#12345)', () => {
      const breadcrumbs = BreadcrumbGenerator.generate({
        pathname: '/sales/payments/9988',
        navigationItems: defaultNavigationItems,
      });

      expect(breadcrumbs).toHaveLength(4);
      expect(breadcrumbs[breadcrumbs.length - 1]?.label).toBe('#9988');
    });

    it('formats UUID identifiers into truncated hashes', () => {
      const breadcrumbs = BreadcrumbGenerator.generate({
        pathname: '/clients/12345678-1234-1234-1234-123456789abc',
        navigationItems: defaultNavigationItems,
      });

      expect(breadcrumbs).toHaveLength(3);
      expect(breadcrumbs[breadcrumbs.length - 1]?.label).toBe('#12345678');
    });
  });

  describe('Route Handle Metadata Resolution (Strategy A)', () => {
    it('prefers route handle metadata over URL segment humanization when present', () => {
      const breadcrumbs = BreadcrumbGenerator.generate({
        pathname: '/settings/general',
        navigationItems: defaultNavigationItems,
        matches: [
          {
            pathname: '/settings/general',
            params: {},
            handle: {
              breadcrumb: 'General Settings',
            },
          },
        ],
      });

      expect(breadcrumbs).toHaveLength(2);
      expect(breadcrumbs[0]?.label).toBe('Dashboard');
      expect(breadcrumbs[1]?.label).toBe('General Settings');
      expect(breadcrumbs[1]?.isCurrent).toBe(true);
    });

    it('supports functional breadcrumb resolvers with route params', () => {
      const breadcrumbs = BreadcrumbGenerator.generate({
        pathname: '/clients/c-42',
        navigationItems: defaultNavigationItems,
        matches: [
          {
            pathname: '/clients/c-42',
            params: { clientId: 'c-42' },
            handle: {
              breadcrumb: (params: Record<string, string>) => `Client [${params.clientId}]`,
            },
          },
        ],
      });

      expect(breadcrumbs).toHaveLength(2);
      expect(breadcrumbs[1]?.label).toBe('Client [c-42]');
      expect(breadcrumbs[1]?.isCurrent).toBe(true);
    });
  });
});
