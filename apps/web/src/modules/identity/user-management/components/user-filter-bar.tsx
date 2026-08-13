import { Button, Input } from '@kinergy-platform/ui';
import React, { useEffect, useState } from 'react';
import type { UserRole, UserStatus } from '../domain/user.types';

export interface UserFilterBarProps {
  readonly search: string;
  readonly status: UserStatus | undefined;
  readonly role: UserRole | undefined;
  readonly isFiltered: boolean;
  readonly onSearchChange: (q: string) => void;
  readonly onStatusChange: (status: UserStatus | 'ALL') => void;
  readonly onRoleChange: (role: UserRole | 'ALL') => void;
  readonly onResetFilters: () => void;
  readonly onCreateClick?: () => void;
  readonly canCreate?: boolean;
}

/**
 * UserFilterBar Component
 *
 * Provides accessible controls for searching by name/email, filtering by status/role,
 * resetting active filters, and triggering the Create User action.
 */
export const UserFilterBar: React.FC<UserFilterBarProps> = ({
  search,
  status,
  role,
  isFiltered,
  onSearchChange,
  onStatusChange,
  onRoleChange,
  onResetFilters,
  onCreateClick,
  canCreate = true,
}) => {
  const [searchInput, setSearchInput] = useState(search);

  // Synchronize local input state with URL param
  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearchChange(searchInput);
  };

  const handleSearchBlur = () => {
    if (searchInput !== search) {
      onSearchChange(searchInput);
    }
  };

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
      <form onSubmit={handleSearchSubmit} className="flex flex-1 items-center gap-3 max-w-md">
        <div className="relative w-full">
          <Input
            type="search"
            placeholder="Search by name or email..."
            aria-label="Search users by name or email"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onBlur={handleSearchBlur}
            className="w-full pl-9"
          />
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-3">
        {/* Status Filter */}
        <select
          value={status ?? 'ALL'}
          onChange={(e) => onStatusChange(e.target.value as UserStatus | 'ALL')}
          aria-label="Filter by user status"
          className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <option value="ALL">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="PENDING">Pending</option>
          <option value="BLOCKED">Blocked</option>
        </select>

        {/* Role Filter */}
        <select
          value={role ?? 'ALL'}
          onChange={(e) => onRoleChange(e.target.value as UserRole | 'ALL')}
          aria-label="Filter by user role"
          className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <option value="ALL">All Roles</option>
          <option value="ADMIN">Admin</option>
          <option value="OPERATOR">Operator</option>
          <option value="MEMBER">Member</option>
        </select>

        {/* Reset Filters */}
        {isFiltered && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onResetFilters}
            aria-label="Clear active filters"
          >
            Reset Filters
          </Button>
        )}

        {/* Primary Create Action */}
        {canCreate && onCreateClick && (
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={onCreateClick}
            aria-label="Create new user account"
          >
            + Create User
          </Button>
        )}
      </div>
    </div>
  );
};

UserFilterBar.displayName = 'UserFilterBar';
