import React, { useMemo } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Badge,
  Spinner,
} from '@kinergy-platform/ui';
import { AssignedClientMembershipVM, PaginatedAssignedClientsVM } from '../types';

interface AssignedClientsTableProps {
  data?: PaginatedAssignedClientsVM;
  isLoading: boolean;
  isError: boolean;
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
  statusFilter: string;
  searchTerm: string;
  onPageChange: (newPage: number) => void;
  onLimitChange: (newLimit: number) => void;
  onSortChange: (newSortBy: 'daysRemaining' | 'endDate' | 'startDate' | 'assignedAt') => void;
  onStatusFilterChange: (newStatus: string) => void;
  onSearchChange: (newSearch: string) => void;
  onRetry: () => void;
  onSelectClient?: (clientId: string) => void;
}

export const AssignedClientsTable: React.FC<AssignedClientsTableProps> = ({
  data,
  isLoading,
  isError,
  page,
  limit,
  sortBy = 'daysRemaining',
  sortOrder = 'ASC',
  statusFilter,
  searchTerm,
  onPageChange,
  onLimitChange,
  onSortChange,
  onStatusFilterChange,
  onSearchChange,
  onRetry,
  onSelectClient,
}) => {
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = (data?.totalPages ?? Math.ceil(total / limit)) || 1;

  // Filter items in-memory if search term is active
  const displayedItems = useMemo(() => {
    if (!searchTerm.trim()) return items;
    const term = searchTerm.toLowerCase();
    return items.filter(
      (item) =>
        item.clientId.toLowerCase().includes(term) ||
        item.planName.toLowerCase().includes(term) ||
        item.membershipId.toLowerCase().includes(term),
    );
  }, [items, searchTerm]);

  const getStatusBadge = (status: string, isFrozen: boolean) => {
    if (isFrozen || status === 'FROZEN') {
      return <Badge variant="outline">FROZEN</Badge>;
    }
    switch (status) {
      case 'ACTIVE':
        return <Badge variant="default">ACTIVE</Badge>;
      case 'EXPIRED':
        return <Badge variant="destructive">EXPIRED</Badge>;
      case 'PENDING_ACTIVATION':
        return <Badge variant="secondary">PENDING</Badge>;
      case 'CANCELLED':
      case 'TERMINATED':
        return <Badge variant="destructive">{status}</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getDaysRemainingBadge = (item: AssignedClientMembershipVM) => {
    if (item.isExpired || item.status === 'EXPIRED') {
      return (
        <Badge variant="destructive" size="sm">
          Expired
        </Badge>
      );
    }
    if (item.isExpiringSoon) {
      return (
        <Badge variant="destructive" size="sm">
          {item.daysRemaining === 0 ? 'Expires Today' : `${item.daysRemaining}d remaining`}
        </Badge>
      );
    }
    return (
      <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
        {item.daysRemaining} days
      </span>
    );
  };

  return (
    <Card className="border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 shadow-sm">
      <CardHeader className="p-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <span className="text-indigo-500 font-bold" aria-hidden="true">
              📋
            </span>
            <CardTitle className="text-base font-bold text-slate-900 dark:text-white">
              Assigned Client Roster
            </CardTitle>
            <Badge variant="secondary" size="sm">
              {total} Total
            </Badge>
          </div>

          {/* Table Filters Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Filter by Client or Plan..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              aria-label="Filter roster"
            />
            <select
              value={statusFilter}
              onChange={(e) => onStatusFilterChange(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              aria-label="Filter by membership status"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active Only</option>
              <option value="EXPIRING">Expiring Soon</option>
              <option value="FROZEN">Frozen Only</option>
            </select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-3 text-slate-500">
            <Spinner size="md" />
            <p className="text-xs">Loading assigned clients...</p>
          </div>
        ) : isError ? (
          <div className="py-12 text-center">
            <p className="text-sm font-semibold text-red-600 dark:text-red-400 mb-2">
              Failed to load assigned client roster.
            </p>
            <Button variant="outline" size="sm" onClick={onRetry}>
              Retry Roster
            </Button>
          </div>
        ) : displayedItems.length === 0 ? (
          <div className="py-12 text-center text-slate-500 dark:text-slate-400">
            <p className="text-base font-semibold">No assigned clients found</p>
            <p className="text-xs mt-1">
              {searchTerm || statusFilter !== 'ALL'
                ? 'Try adjusting your search or status filter.'
                : 'No clients are currently assigned to your roster.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="w-full text-left text-xs"
              aria-label="Assigned Client Memberships Table"
            >
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 uppercase tracking-wider font-semibold">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Client
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Plan
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Status
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 cursor-pointer hover:text-indigo-600 select-none"
                    onClick={() => onSortChange('endDate')}
                  >
                    Valid Period {sortBy === 'endDate' ? (sortOrder === 'ASC' ? '▲' : '▼') : ''}
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 cursor-pointer hover:text-indigo-600 select-none"
                    onClick={() => onSortChange('daysRemaining')}
                  >
                    Days Remaining{' '}
                    {sortBy === 'daysRemaining' ? (sortOrder === 'ASC' ? '▲' : '▼') : ''}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {displayedItems.map((item) => (
                  <tr
                    key={item.membershipId}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                      <div>{item.clientId}</div>
                      <span className="text-[10px] text-slate-400 font-normal">
                        Mem: {item.membershipId}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 font-medium">
                      {item.planName}
                    </td>
                    <td className="px-4 py-3">
                      {getStatusBadge(item.status, item.isCurrentlyFrozen)}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                      {new Date(item.startDate).toLocaleDateString()} —{' '}
                      {new Date(item.endDate).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">{getDaysRemainingBadge(item)}</td>
                    <td className="px-4 py-3 text-right">
                      {onSelectClient && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800"
                          onClick={() => onSelectClient(item.clientId)}
                        >
                          Details
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {total > 0 && !isLoading && !isError && (
          <div className="p-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
            <div className="flex items-center space-x-2">
              <span>
                Showing {Math.min((page - 1) * limit + 1, total)} to {Math.min(page * limit, total)}{' '}
                of {total} clients
              </span>
              <select
                value={limit}
                onChange={(e) => onLimitChange(Number(e.target.value))}
                className="px-2 py-1 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-xs"
                aria-label="Items per page"
              >
                <option value={5}>5 / page</option>
                <option value={10}>10 / page</option>
                <option value={20}>20 / page</option>
                <option value={50}>50 / page</option>
              </select>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => onPageChange(page - 1)}
              >
                Previous
              </Button>
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => onPageChange(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
