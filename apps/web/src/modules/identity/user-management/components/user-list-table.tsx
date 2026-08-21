import { Button } from '@kinergy-platform/ui';
import type { ColumnDef, OnChangeFn, SortingState } from '@tanstack/react-table';
import React, { useMemo } from 'react';
import {
  DataTable,
  DataTableColumnHeader,
  DataTableRowActions,
  type DataTableRowAction,
} from '../../../../shared/table';
import type { ManagedUser } from '../domain/user.types';
import { UserStatusBadge } from './user-status-badge';

export interface UserListTableProps {
  readonly users: readonly ManagedUser[];
  readonly totalCount?: number;
  readonly page?: number;
  readonly pageSize?: number;
  readonly onPageChange?: (page: number) => void;
  readonly onPageSizeChange?: (pageSize: number) => void;
  readonly sorting?: SortingState;
  readonly onSortingChange?: OnChangeFn<SortingState>;
  readonly isLoading?: boolean;
  readonly isError?: boolean;
  readonly errorMessage?: React.ReactNode;
  readonly onRetry?: () => void;
  readonly isFiltered?: boolean;
  readonly onResetFilters?: () => void;
  readonly toolbar?: React.ReactNode;
  readonly onActivate?: (user: ManagedUser) => void;
  readonly onDeactivate?: (user: ManagedUser) => void;
  readonly onEdit?: (user: ManagedUser) => void;
  readonly isActivating?: boolean;
  readonly isDeactivating?: boolean;
  readonly canManageUsers?: boolean;
}

/**
 * UserListTable Component
 *
 * Implements Track C — Step C2.5 DataTable Integration with User Management.
 * Replaces bespoke table markup with standardized, accessible <DataTable />.
 */
export const UserListTable: React.FC<UserListTableProps> = ({
  users,
  totalCount,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  sorting,
  onSortingChange,
  isLoading = false,
  isError = false,
  errorMessage,
  onRetry,
  isFiltered = false,
  onResetFilters,
  toolbar,
  onActivate,
  onDeactivate,
  onEdit,
  isActivating = false,
  isDeactivating = false,
  canManageUsers = true,
}) => {
  const columns = useMemo<ColumnDef<ManagedUser, unknown>[]>(() => {
    return [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} title="User" />,
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-semibold text-foreground">{row.original.name}</span>
            <span className="text-xs text-muted-foreground">{row.original.email}</span>
          </div>
        ),
        enableSorting: true,
        enableHiding: false,
      },
      {
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => <UserStatusBadge status={row.original.status} />,
        enableSorting: true,
        enableHiding: true,
      },
      {
        accessorKey: 'roles',
        header: 'Role',
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{row.original.roles.join(', ')}</span>
        ),
        enableSorting: false,
        enableHiding: true,
      },
      {
        accessorKey: 'lastLoginAt',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Last Login" />,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.lastLoginAt
              ? new Date(row.original.lastLoginAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : 'Never'}
          </span>
        ),
        enableSorting: true,
        enableHiding: true,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const user = row.original;
          const isUserActive = user.status === 'ACTIVE';

          const rowActions: DataTableRowAction<ManagedUser>[] = [
            {
              id: 'edit',
              label: 'Edit',
              onClick: () => onEdit?.(user),
              disabled: !canManageUsers,
            },
            {
              id: 'activate',
              label: 'Activate',
              onClick: () => onActivate?.(user),
              disabled: isActivating || !canManageUsers,
              hidden: isUserActive,
            },
            {
              id: 'deactivate',
              label: 'Deactivate',
              onClick: () => onDeactivate?.(user),
              disabled: isDeactivating || !canManageUsers,
              hidden: !isUserActive,
              isDestructive: true,
            },
          ];

          return (
            <div className="flex items-center justify-end gap-2 whitespace-nowrap">
              {/* Direct Quick Action Buttons for high ergonomics */}
              {onEdit && canManageUsers && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit(user)}
                  aria-label={`Edit details for user ${user.name}`}
                  className="hidden sm:inline-flex"
                >
                  Edit
                </Button>
              )}

              {!isUserActive && onActivate && canManageUsers && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isActivating}
                  onClick={() => onActivate(user)}
                  aria-label={`Activate user account for ${user.name}`}
                  className="hidden sm:inline-flex text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                >
                  Activate
                </Button>
              )}

              {isUserActive && onDeactivate && canManageUsers && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isDeactivating}
                  onClick={() => onDeactivate(user)}
                  aria-label={`Deactivate user account for ${user.name}`}
                  className="hidden sm:inline-flex text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  Deactivate
                </Button>
              )}

              {/* Standard Accessible Row Action Menu */}
              <DataTableRowActions row={user} actions={rowActions} />
            </div>
          );
        },
        enableHiding: false,
      },
    ];
  }, [onActivate, onDeactivate, onEdit, isActivating, isDeactivating, canManageUsers]);

  return (
    <DataTable
      columns={columns}
      data={users}
      totalCount={totalCount}
      page={page}
      pageSize={pageSize}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
      sorting={sorting}
      onSortingChange={onSortingChange}
      isLoading={isLoading}
      isError={isError}
      errorMessage={errorMessage}
      onRetry={onRetry}
      isFiltered={isFiltered}
      emptyTitle={isFiltered ? 'No users matching search filters' : 'No user accounts found'}
      emptyDescription={
        isFiltered
          ? 'Try broadening your search query or clearing active status/role filters.'
          : 'There are currently no user accounts registered in the platform.'
      }
      onResetFilters={onResetFilters}
      ariaLabel="User Accounts List"
      toolbar={toolbar}
    />
  );
};

UserListTable.displayName = 'UserListTable';
