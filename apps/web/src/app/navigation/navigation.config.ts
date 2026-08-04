import { Activity, BarChart3, LayoutDashboard, Shield, Users } from 'lucide-react';
import type { NavigationItem } from './navigation.types';

/**
 * Baseline Core Navigation Configuration
 *
 * Registered baseline navigation entries for default platform infrastructure.
 */
export const defaultNavigationItems: NavigationItem[] = [
  {
    id: 'overview',
    label: 'Overview',
    path: '/',
    icon: LayoutDashboard,
    order: 10,
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
];
