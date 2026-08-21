import type { OnChangeFn, SortingState } from '@tanstack/react-table';
import React, { useState } from 'react';
import { useAuth } from '../../../../app/providers/auth-provider';
import {
  useActivateUserMutation,
  useDeactivateUserMutation,
  useUsersQuery,
} from '../api/user-management-queries';
import { DeactivateUserDialog } from '../components/deactivate-user-dialog';
import { UserEditDialog } from '../components/user-edit-dialog';
import { UserFilterBar } from '../components/user-filter-bar';
import { UserFormDialog } from '../components/user-form-dialog';
import { UserListTable } from '../components/user-list-table';
import type { ManagedUser } from '../domain/user.types';
import { useUserFilters } from '../hooks/use-user-filters';

export interface UserListPageProps {
  readonly onCreateUserClick?: () => void;
  readonly onEditUserClick?: (user: ManagedUser) => void;
}

/**
 * UserListPage View Component
 *
 * Implements Track C — Step C2.5 DataTable Integration with User Management.
 * Derives query parameters strictly from URL state and renders the integrated <UserListTable />.
 */
export const UserListPage: React.FC<UserListPageProps> = ({
  onCreateUserClick,
  onEditUserClick,
}) => {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [deactivatingUser, setDeactivatingUser] = useState<ManagedUser | null>(null);

  const { hasPermission, hasRole } = useAuth();
  const canManageUsers = hasPermission('manage:users') || hasRole('ADMIN');

  const {
    params,
    isFiltered,
    setSearch,
    setStatus,
    setRole,
    setPage,
    setLimit,
    setSort,
    resetFilters,
    sortState,
  } = useUserFilters();

  const { data, isLoading, isError, error, refetch } = useUsersQuery(params);

  const activateMutation = useActivateUserMutation();
  const deactivateMutation = useDeactivateUserMutation();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const page = data?.page ?? 1;

  const handleActivate = (user: ManagedUser) => {
    activateMutation.mutate(user.id);
  };

  const handleDeactivateRequest = (user: ManagedUser) => {
    setDeactivatingUser(user);
  };

  const handleConfirmDeactivate = (user: ManagedUser) => {
    deactivateMutation.mutate(user.id, {
      onSuccess: () => {
        setDeactivatingUser(null);
      },
    });
  };

  const handleSortingChange: OnChangeFn<SortingState> = (updaterOrValue) => {
    const nextSorting =
      typeof updaterOrValue === 'function' ? updaterOrValue(sortState) : updaterOrValue;
    if (nextSorting.length === 0) {
      setSort(undefined);
    } else {
      const first = nextSorting[0];
      if (first) {
        setSort(`${first.id}.${first.desc ? 'desc' : 'asc'}`);
      }
    }
  };

  const handleCreateClick = onCreateUserClick ?? (() => setIsCreateDialogOpen(true));

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      {/* Page Header */}
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">User Management</h1>
          <p className="text-sm text-muted-foreground">
            Manage user accounts, identity roles, and access status across the platform.
          </p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <UserFilterBar
        search={params.q ?? ''}
        status={params.status}
        role={params.role}
        isFiltered={isFiltered}
        onSearchChange={setSearch}
        onStatusChange={setStatus}
        onRoleChange={setRole}
        onResetFilters={resetFilters}
        onCreateClick={handleCreateClick}
        canCreate={canManageUsers}
      />

      {/* Primary Data Table */}
      <UserListTable
        users={items}
        totalCount={total}
        page={page}
        pageSize={params.limit ?? 10}
        onPageChange={setPage}
        onPageSizeChange={setLimit}
        sorting={sortState}
        onSortingChange={handleSortingChange}
        isLoading={isLoading}
        isError={isError}
        errorMessage={error?.message || 'Failed to load user accounts from platform API.'}
        onRetry={() => void refetch()}
        isFiltered={isFiltered}
        onResetFilters={resetFilters}
        onActivate={handleActivate}
        onDeactivate={handleDeactivateRequest}
        onEdit={onEditUserClick ?? ((user) => setEditingUser(user))}
        isActivating={activateMutation.isPending}
        isDeactivating={deactivateMutation.isPending}
        canManageUsers={canManageUsers}
      />

      {/* Create User Form Dialog Modal */}
      <UserFormDialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen} />

      {/* Edit User Form Dialog Modal */}
      <UserEditDialog
        user={editingUser}
        open={Boolean(editingUser)}
        onOpenChange={(open) => !open && setEditingUser(null)}
      />

      {/* Deactivate User Confirmation Dialog Modal */}
      <DeactivateUserDialog
        user={deactivatingUser}
        open={Boolean(deactivatingUser)}
        onOpenChange={(open) => !open && setDeactivatingUser(null)}
        onConfirm={handleConfirmDeactivate}
        isDeactivating={deactivateMutation.isPending}
      />
    </div>
  );
};

UserListPage.displayName = 'UserListPage';
