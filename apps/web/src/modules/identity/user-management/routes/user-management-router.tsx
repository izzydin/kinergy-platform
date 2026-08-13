import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { UserListPage } from '../views/user-list-page';

/**
 * UserManagementSubRouter Component
 *
 * Internal module router handling sub-routes under `/admin/users`.
 */
export const UserManagementSubRouter: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<UserListPage />} />
      <Route path="*" element={<UserListPage />} />
    </Routes>
  );
};

UserManagementSubRouter.displayName = 'UserManagementSubRouter';
