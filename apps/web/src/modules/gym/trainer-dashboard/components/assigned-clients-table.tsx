import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
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
  assignmentFilter?: string;
  searchTerm: string;
  currentTrainerId?: string;
  onPageChange: (newPage: number) => void;
  onLimitChange: (newLimit: number) => void;
  onSortChange: (newSortBy: 'daysRemaining' | 'endDate' | 'startDate' | 'assignedAt') => void;
  onStatusFilterChange: (newStatus: string) => void;
  onAssignmentFilterChange?: (newAssignmentFilter: string) => void;
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
  assignmentFilter = 'ALL',
  searchTerm,
  currentTrainerId,
  onPageChange,
  onLimitChange,
  onSortChange,
  onStatusFilterChange,
  onAssignmentFilterChange,
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
        (item.fullName && item.fullName.toLowerCase().includes(term)) ||
        (item.clientName && item.clientName.toLowerCase().includes(term)) ||
        (item.email && item.email.toLowerCase().includes(term)) ||
        (item.phone && item.phone.toLowerCase().includes(term)) ||
        (item.referenceNumber && item.referenceNumber.toLowerCase().includes(term)) ||
        item.planName.toLowerCase().includes(term) ||
        item.membershipId.toLowerCase().includes(term),
    );
  }, [items, searchTerm]);

  const getStatusBadge = (status: string, isFrozen: boolean) => {
    if (isFrozen || status === 'FROZEN') {
      return (
        <Badge variant="outline" data-testid="status-badge-frozen">
          FROZEN
        </Badge>
      );
    }
    switch (status) {
      case 'ACTIVE':
        return (
          <Badge variant="default" data-testid="status-badge-active">
            ACTIVE
          </Badge>
        );
      case 'EXPIRED':
        return (
          <Badge variant="destructive" data-testid="status-badge-expired">
            EXPIRED
          </Badge>
        );
      case 'PENDING_ACTIVATION':
        return (
          <Badge variant="secondary" data-testid="status-badge-pending">
            PENDING
          </Badge>
        );
      case 'CANCELLED':
      case 'TERMINATED':
        return (
          <Badge variant="destructive" data-testid="status-badge-cancelled">
            {status}
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" data-testid="status-badge-other">
            {status}
          </Badge>
        );
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

  const getTrainerBadge = (assignedTrainerId?: string | null) => {
    if (!assignedTrainerId) {
      return (
        <Badge variant="secondary" size="sm" data-testid="trainer-badge-unassigned">
          Unassigned
        </Badge>
      );
    }
    if (currentTrainerId && assignedTrainerId === currentTrainerId) {
      return (
        <Badge variant="default" size="sm" data-testid="trainer-badge-me">
          Assigned to You
        </Badge>
      );
    }
    return (
      <Badge
        variant="outline"
        size="sm"
        data-testid="trainer-badge-other"
        title={assignedTrainerId}
      >
        {assignedTrainerId.length > 16 ? `${assignedTrainerId.slice(0, 14)}...` : assignedTrainerId}
      </Badge>
    );
  };

  const getInitials = (name?: string, id?: string) => {
    if (!name && !id) return 'CL';
    const source = (name || id || '').trim();
    const parts = source.split(/\s+/);
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return source.slice(0, 2).toUpperCase();
  };

  return (
    <Card
      className="border border-border bg-card shadow-sm"
      data-testid="assigned-clients-table-container"
    >
      <CardHeader className="p-4 border-b border-border">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <span className="text-primary font-bold" aria-hidden="true">
              📋
            </span>
            <CardTitle className="text-base font-bold text-foreground">
              Facility Clients
              <span className="sr-only">Assigned Client Roster</span>
            </CardTitle>
            <Badge variant="secondary" size="sm">
              Facility Roster
            </Badge>
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
              className="text-xs px-2.5 py-1.5 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Filter roster"
            />
            {onAssignmentFilterChange && (
              <select
                value={assignmentFilter || 'ALL'}
                onChange={(e) => onAssignmentFilterChange(e.target.value)}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                aria-label="Filter by trainer assignment"
                data-testid="assignment-filter-select"
              >
                <option value="ALL">All Facility Clients</option>
                <option value="ASSIGNED_TO_ME">Assigned to You</option>
                <option value="OTHER_TRAINERS">Other Trainers</option>
                <option value="UNASSIGNED">Unassigned</option>
              </select>
            )}
            <select
              value={statusFilter}
              onChange={(e) => onStatusFilterChange(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Filter by membership status"
              data-testid="status-filter-select"
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
          <div className="py-12 text-center text-muted-foreground">
            <p className="text-base font-semibold">No facility clients found</p>
            <p className="sr-only">No assigned clients found</p>
            <p className="text-xs mt-1">
              {searchTerm || statusFilter !== 'ALL' || assignmentFilter !== 'ALL'
                ? 'Try adjusting your search or filters.'
                : 'No clients are currently assigned to your roster.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="w-full text-left text-xs"
              aria-label="Assigned Client Memberships Table"
            >
              <thead className="bg-muted/50 text-muted-foreground border-b border-border uppercase tracking-wider font-semibold">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Client
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Assignment
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Plan
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Status
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 cursor-pointer hover:text-primary select-none"
                    onClick={() => onSortChange('endDate')}
                  >
                    Valid Period {sortBy === 'endDate' ? (sortOrder === 'ASC' ? '▲' : '▼') : ''}
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 cursor-pointer hover:text-primary select-none"
                    onClick={() => onSortChange('daysRemaining')}
                  >
                    Days Remaining{' '}
                    {sortBy === 'daysRemaining' ? (sortOrder === 'ASC' ? '▲' : '▼') : ''}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Last Check-in
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {displayedItems.map((item) => (
                  <tr key={item.membershipId} className="hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-3 font-semibold text-foreground">
                      <div className="flex items-center space-x-2.5">
                        <div
                          className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[11px] shrink-0 border border-primary/20"
                          aria-hidden="true"
                        >
                          {getInitials(item.fullName || item.clientName, item.clientId)}
                        </div>
                        <div className="min-w-0">
                          <Link
                            to={`/clients/${item.clientId}`}
                            className="hover:underline text-primary focus:outline-none focus:ring-2 focus:ring-ring rounded font-medium truncate block"
                          >
                            {item.fullName || item.clientName || item.clientId}
                          </Link>
                          {(item.email || item.phone) && (
                            <div className="text-[11px] text-muted-foreground font-normal truncate max-w-xs">
                              {item.email}
                              {item.phone && <span className="ml-1">• {item.phone}</span>}
                            </div>
                          )}
                          <span className="text-[10px] text-muted-foreground font-normal">
                            {item.referenceNumber && (
                              <span className="mr-1.5 font-mono text-[9px] bg-muted px-1 py-0.5 rounded">
                                {item.referenceNumber}
                              </span>
                            )}
                            Mem:{' '}
                            <Link
                              to={`/gym/memberships/${item.membershipId}`}
                              className="hover:underline text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring rounded"
                            >
                              {item.membershipId}
                            </Link>
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {getTrainerBadge(item.assignedTrainerId)}
                    </td>
                    <td className="px-4 py-3 text-foreground font-medium">{item.planName}</td>
                    <td className="px-4 py-3">
                      {getStatusBadge(item.status, item.isCurrentlyFrozen)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {new Date(item.startDate).toLocaleDateString()} —{' '}
                      {new Date(item.endDate).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">{getDaysRemainingBadge(item)}</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {item.lastAttendanceDate ? (
                        <span>{new Date(item.lastAttendanceDate).toLocaleDateString()}</span>
                      ) : (
                        <span className="text-muted-foreground/60 italic">No visits yet</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end space-x-1">
                        <Link
                          to={`/clients/${item.clientId}`}
                          className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors"
                          title="View Client Profile"
                        >
                          Profile
                        </Link>
                        {onSelectClient && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-primary hover:text-primary/80"
                            onClick={() => onSelectClient(item.clientId)}
                          >
                            Details
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {total > 0 && !isLoading && !isError && (
          <div className="p-3 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
            <div className="flex items-center space-x-2">
              <span>
                Showing {Math.min((page - 1) * limit + 1, total)} to {Math.min(page * limit, total)}{' '}
                of {total} clients
              </span>
              <select
                value={limit}
                onChange={(e) => onLimitChange(Number(e.target.value))}
                className="px-2 py-1 border border-input rounded bg-background text-foreground text-xs focus:ring-2 focus:ring-ring"
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
              <span className="font-semibold text-foreground">
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
