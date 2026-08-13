import { Button } from '@kinergy-platform/ui';
import React from 'react';
import type { ManagedUser } from '../domain/user.types';
import { UserStatusBadge } from './user-status-badge';

export interface UserListTableProps {
  readonly users: readonly ManagedUser[];
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
 * Renders an accessible, responsive table listing Identity Users.
 * Implements accessible landmark table semantics and explicit action controls.
 */
export const UserListTable: React.FC<UserListTableProps> = ({
  users,
  onActivate,
  onDeactivate,
  onEdit,
  isActivating = false,
  isDeactivating = false,
  canManageUsers = true,
}) => {
  return (
    <div className="w-full overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-left text-sm" aria-label="User Accounts List">
        <thead className="border-b border-border bg-muted/50 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <tr>
            <th scope="col" className="px-4 py-3.5">
              User
            </th>
            <th scope="col" className="px-4 py-3.5">
              Status
            </th>
            <th scope="col" className="px-4 py-3.5">
              Role
            </th>
            <th scope="col" className="px-4 py-3.5">
              Last Login
            </th>
            <th scope="col" className="px-4 py-3.5 text-right">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border font-medium">
          {users.map((user) => {
            const isUserActive = user.status === 'ACTIVE';

            return (
              <tr
                key={user.id}
                className="transition-colors hover:bg-muted/40 focus-within:bg-muted/40"
              >
                {/* User Name & Email */}
                <th scope="row" className="px-4 py-3.5 font-normal">
                  <div className="flex flex-col">
                    <span className="font-semibold text-foreground">{user.name}</span>
                    <span className="text-xs text-muted-foreground">{user.email}</span>
                  </div>
                </th>

                {/* Status Badge */}
                <td className="px-4 py-3.5 whitespace-nowrap">
                  <UserStatusBadge status={user.status} />
                </td>

                {/* Role */}
                <td className="px-4 py-3.5 whitespace-nowrap text-xs text-muted-foreground">
                  {user.roles.join(', ')}
                </td>

                {/* Last Login */}
                <td className="px-4 py-3.5 whitespace-nowrap text-xs text-muted-foreground">
                  {user.lastLoginAt
                    ? new Date(user.lastLoginAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : 'Never'}
                </td>

                {/* Actions */}
                <td className="px-4 py-3.5 whitespace-nowrap text-right">
                  <div className="flex items-center justify-end gap-2">
                    {/* Edit Action */}
                    {onEdit && canManageUsers && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onEdit(user)}
                        aria-label={`Edit details for user ${user.name}`}
                      >
                        Edit
                      </Button>
                    )}

                    {/* Activate Action */}
                    {!isUserActive && onActivate && canManageUsers && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isActivating}
                        onClick={() => onActivate(user)}
                        aria-label={`Activate user account for ${user.name}`}
                        className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                      >
                        Activate
                      </Button>
                    )}

                    {/* Deactivate Action */}
                    {isUserActive && onDeactivate && canManageUsers && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isDeactivating}
                        onClick={() => onDeactivate(user)}
                        aria-label={`Deactivate user account for ${user.name}`}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        Deactivate
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

UserListTable.displayName = 'UserListTable';
