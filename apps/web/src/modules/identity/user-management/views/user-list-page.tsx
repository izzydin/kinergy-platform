import { Button, Skeleton, StateView } from '@kinergy-platform/ui';
import React, { useState } from 'react';
import { useAuth } from '../../../../app/providers/auth-provider';
import {
  useActivateUserMutation,
  useDeactivateUserMutation,
  useUsersQuery,
} from '../api/user-management-queries';
import { UserFilterBar } from '../components/user-filter-bar';
import { UserFormDialog } from '../components/user-form-dialog';
import { UserEditDialog } from '../components/user-edit-dialog';
import { DeactivateUserDialog } from '../components/deactivate-user-dialog';
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
 * Renders the primary User Management list screen adhering to the 4-State UI contract,
 * URL search param state, semantic status badges, and accessible table layout.
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

  const { params, isFiltered, setSearch, setStatus, setRole, setPage, resetFilters } =
    useUserFilters();

  const { data, isLoading, isError, error, refetch } = useUsersQuery(params);

  const activateMutation = useActivateUserMutation();
  const deactivateMutation = useDeactivateUserMutation();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const page = data?.page ?? 1;
  const totalPages = data?.totalPages ?? 1;

  const isEmpty = items.length === 0;

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

  const handleCreateClick = onCreateUserClick ?? (() => setIsCreateDialogOpen(true));

  // Skeleton fallback for 4-State UI Contract Loading state
  const loadingSkeleton = (
    <div className="w-full space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-10 w-full sm:w-72" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-28" />
          <Skeleton className="h-10 w-28" />
        </div>
      </div>
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  );

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

      {/* 4-State UI View */}
      <StateView
        isLoading={isLoading}
        loadingFallback={loadingSkeleton}
        isError={isError}
        errorMessage={error?.message || 'Failed to load user accounts from platform API.'}
        onRetry={() => void refetch()}
        isEmpty={isEmpty}
        emptyTitle={isFiltered ? 'No users matching search filters' : 'No user accounts found'}
        emptyDescription={
          isFiltered
            ? 'Try broadening your search query or clearing active status/role filters.'
            : 'There are currently no user accounts registered in the platform.'
        }
        emptyAction={
          isFiltered ? (
            <Button variant="outline" size="sm" onClick={resetFilters}>
              Reset Filters
            </Button>
          ) : (
            canManageUsers && (
              <Button variant="default" size="sm" onClick={handleCreateClick}>
                Create First User
              </Button>
            )
          )
        }
      >
        {/* Populated State */}
        <div className="space-y-4">
          <UserListTable
            users={items}
            onActivate={handleActivate}
            onDeactivate={handleDeactivateRequest}
            onEdit={onEditUserClick ?? ((user) => setEditingUser(user))}
            isActivating={activateMutation.isPending}
            isDeactivating={deactivateMutation.isPending}
            canManageUsers={canManageUsers}
          />

          {/* Pagination Bar */}
          {totalPages > 1 && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between py-2 text-sm text-muted-foreground">
              <div>
                Showing page <span className="font-semibold text-foreground">{page}</span> of{' '}
                <span className="font-semibold text-foreground">{totalPages}</span> ({total} total
                users)
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  aria-label="Navigate to previous page"
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                  aria-label="Navigate to next page"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </StateView>

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
