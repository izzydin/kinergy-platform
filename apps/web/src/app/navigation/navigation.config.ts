import { Boxes, LayoutDashboard, Receipt, Settings, Shield, Users } from 'lucide-react';
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
    id: 'clients',
    label: 'Client Profiles',
    path: '/clients',
    icon: Users,
    order: 20,
    section: 'core',
    requiredPermissions: ['client:read'],
  },
  {
    id: 'sales',
    label: 'Sales & Payments',
    path: '/sales',
    icon: Receipt,
    order: 25,
    section: 'core',
    requiredPermissions: ['sales.read'],
  },
  {
    id: 'resources',
    label: 'Resource Overview',
    path: '/resources/overview',
    icon: Boxes,
    order: 35,
    section: 'core',
    requiredPermissions: ['inventory.read', 'assets.read'],
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
