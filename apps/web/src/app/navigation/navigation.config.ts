import {
  Activity,
  BarChart3,
  LayoutDashboard,
  Settings,
  Shield,
  TestTube,
  Users,
} from 'lucide-react';
import type { NavigationItem } from './navigation.types';

/**
 * Baseline Core Navigation Configuration
 *
 * Registered baseline navigation entries for platform infrastructure and mock feature modules.
 */
export const defaultNavigationItems: NavigationItem[] = [
  {
    id: 'overview',
    label: 'Overview',
    path: '/',
    icon: LayoutDashboard,
    order: 5,
    section: 'overview',
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    path: '/dashboard',
    icon: LayoutDashboard,
    order: 10,
    section: 'overview',
  },
  {
    id: 'dashboard-ui-states',
    label: 'UI States & A6 Showcase',
    path: '/dashboard/ui-states',
    icon: TestTube,
    order: 15,
    section: 'overview',
  },

  {
    id: 'clients',
    label: 'Client Profiles',
    path: '/clients',
    icon: Users,
    order: 20,
    section: 'core',
    requiredPermissions: ['client:read'],
  },
  {
    id: 'energy',
    label: 'Energy Telemetry',
    path: '/energy',
    icon: Activity,
    order: 30,
    section: 'core',
    requiredPermissions: ['energy:read'],
    requiredTenantFeatures: ['ENABLE_TELEMETRY'],
  },
  {
    id: 'analytics',
    label: 'Analytics',
    path: '/analytics',
    icon: BarChart3,
    order: 40,
    section: 'core',
    requiredPermissions: ['analytics:read'],
    requiredTenantFeatures: ['ENABLE_ADVANCED_ANALYTICS'],
  },
  {
    id: 'admin',
    label: 'Administration',
    path: '/admin',
    icon: Shield,
    order: 90,
    section: 'admin',
    requiredPermissions: ['admin:read'],
  },
  {
    id: 'settings',
    label: 'Settings',
    path: '/settings',
    icon: Settings,
    order: 95,
    section: 'system',
  },
];
