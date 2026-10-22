import React, { Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Shield } from 'lucide-react';
import { navigationRegistry } from '../../../../app/navigation/navigation-registry';
import { moduleRegistry } from '../../../../app/routes/module-registry';
import { lazyWithRetry, SuspenseFallback } from '../../../../app/routes/lazy-loading';

const UserListPage = lazyWithRetry(() =>
  import('../views/user-list-page').then((m) => ({ default: m.UserListPage })),
);

/**
 * UserManagementSubRouter Component
 *
 * Internal module router handling sub-routes under `/admin/users`.
 */
export const UserManagementSubRouter: React.FC = () => {
  return (
    <Suspense fallback={<SuspenseFallback label="Loading User Management..." />}>
      <Routes>
        <Route path="/" element={<UserListPage />} />
        <Route path="*" element={<UserListPage />} />
      </Routes>
    </Suspense>
  );
};

UserManagementSubRouter.displayName = 'UserManagementSubRouter';

// Register User Management Feature Module Route Contract with central router shell
moduleRegistry.register({
  id: 'user-management',
  prefix: '/admin/users',
  title: 'User Management',
  isProtected: true,
  requiredPermissions: ['manage:users'],
  component: UserManagementSubRouter,
});

// Register User Management Navigation Entry with central navigation registry
navigationRegistry.register({
  id: 'user-management',
  label: 'User Management',
  path: '/admin/users',
  icon: Shield,
  order: 50,
  section: 'admin',
  requiredPermissions: ['manage:users'],
});
