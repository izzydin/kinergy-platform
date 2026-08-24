import React, { useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Badge, Card, CardHeader, CardTitle, CardContent } from '@kinergy-platform/ui';
import { useAuth } from '../../../../app/providers/auth-provider';
import {
  useTrainerDashboardSummary,
  useAssignedClients,
  useExpiringMemberships,
  useTrainerAttendance,
} from '../hooks';
import {
  TrainerSummaryKpiBanner,
  AssignedClientsTable,
  ExpiringMembershipsSection,
  TrainerAttendanceFeed,
  TrainerClientLookup,
} from '../components';
import { ClientSearchResultDTO } from '../types';

export const TrainerDashboardPage: React.FC = () => {
  const { currentUser } = useAuth();
  const trainerId = currentUser?.id ?? '';

  const [searchParams, setSearchParams] = useSearchParams();

  // URL-driven query state
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '10', 10);
  const sortBy =
    (searchParams.get('sortBy') as 'daysRemaining' | 'endDate' | 'startDate' | 'assignedAt') ||
    'daysRemaining';
  const sortOrder = (searchParams.get('sortOrder') as 'ASC' | 'DESC') || 'ASC';
  const statusFilter = searchParams.get('status') || 'ALL';
  const searchTerm = searchParams.get('search') || '';

  const [selectedClient, setSelectedClient] = useState<ClientSearchResultDTO | null>(null);

  // Helper to update URL search parameters cleanly
  const updateUrlParams = useCallback(
    (updates: Record<string, string | null>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          Object.entries(updates).forEach(([key, val]) => {
            if (val === null || val === undefined || val === '') {
              next.delete(key);
            } else {
              next.set(key, val);
            }
          });
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Convert status filter to array for backend
  const backendStatuses = useMemo(() => {
    if (statusFilter === 'ACTIVE') return ['ACTIVE'];
    if (statusFilter === 'FROZEN') return ['FROZEN'];
    if (statusFilter === 'EXPIRING') return ['ACTIVE'];
    return undefined;
  }, [statusFilter]);

  // 1. Authoritative Top-Line Operational Summary KPIs
  const {
    data: summaryData,
    isLoading: isLoadingSummary,
    isError: isErrorSummary,
    refetch: refetchSummary,
  } = useTrainerDashboardSummary({
    trainerId: trainerId || undefined,
    horizonDays: 7,
  });

  // 2. Assigned Clients Roster (Paginated & Sorted)
  const {
    data: assignedClientsData,
    isLoading: isLoadingClients,
    isError: isErrorClients,
    refetch: refetchClients,
  } = useAssignedClients({
    trainerId: trainerId || undefined,
    page,
    limit,
    sortBy,
    sortOrder,
    statuses: backendStatuses,
    horizonDays: 7,
  });

  // 3. Expiring Soon Memberships List (Lookahead Horizon: 7 days)
  const {
    data: expiringData,
    isLoading: isLoadingExpiring,
    isError: isErrorExpiring,
    refetch: refetchExpiring,
  } = useExpiringMemberships({
    trainerId: trainerId || undefined,
    horizonDays: 7,
  });

  // 4. Live Operational Attendance Feed (Trainer's Clients)
  const {
    data: attendanceData,
    isLoading: isLoadingAttendance,
    isError: isErrorAttendance,
    isFetching: isFetchingAttendance,
    refetch: refetchAttendance,
  } = useTrainerAttendance(
    {
      trainerId: trainerId || undefined,
      limit: 20,
    },
    { refetchInterval: 30 * 1000 },
  );

  const handleSelectClientById = (clientId: string) => {
    const match = assignedClientsData?.items.find((m) => m.clientId === clientId);
    setSelectedClient({
      id: clientId,
      fullName: match ? `Client (${clientId})` : clientId,
      email: `${clientId}@kinergy.client`,
      status: match?.status ?? 'ACTIVE',
    });
  };

  const handleRefreshAll = () => {
    refetchSummary();
    refetchClients();
    refetchExpiring();
    refetchAttendance();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Dashboard Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Trainer Operational Dashboard
            </h1>
            <Badge variant="secondary">Gym Operations</Badge>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Real-time client assignments, membership status, and facility check-ins for{' '}
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              {currentUser?.email ?? 'Trainer'}
            </span>
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Button variant="outline" size="sm" onClick={handleRefreshAll}>
            🔄 Refresh Dashboard
          </Button>
        </div>
      </div>

      {/* 1. Authoritative Operational KPI Banner */}
      <section aria-labelledby="kpi-banner-heading">
        <h2 id="kpi-banner-heading" className="sr-only">
          Operational Summary Metrics
        </h2>
        <TrainerSummaryKpiBanner
          summary={summaryData}
          isLoading={isLoadingSummary}
          isError={isErrorSummary}
          onRetry={refetchSummary}
        />
      </section>

      {/* Main 2-Column Responsive Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left / Primary Column: Assigned Clients DataTable (7 cols on desktop) */}
        <section className="lg:col-span-7 space-y-4" aria-labelledby="assigned-clients-heading">
          <h2 id="assigned-clients-heading" className="sr-only">
            Assigned Client Roster
          </h2>
          <AssignedClientsTable
            data={assignedClientsData}
            isLoading={isLoadingClients}
            isError={isErrorClients}
            page={page}
            limit={limit}
            sortBy={sortBy}
            sortOrder={sortOrder}
            statusFilter={statusFilter}
            searchTerm={searchTerm}
            onPageChange={(newPage) => updateUrlParams({ page: String(newPage) })}
            onLimitChange={(newLimit) => updateUrlParams({ limit: String(newLimit), page: '1' })}
            onSortChange={(newSortBy) =>
              updateUrlParams({
                sortBy: newSortBy,
                sortOrder: sortBy === newSortBy && sortOrder === 'ASC' ? 'DESC' : 'ASC',
              })
            }
            onStatusFilterChange={(newStatus) =>
              updateUrlParams({ status: newStatus === 'ALL' ? null : newStatus, page: '1' })
            }
            onSearchChange={(newSearch) =>
              updateUrlParams({ search: newSearch || null, page: '1' })
            }
            onRetry={refetchClients}
            onSelectClient={handleSelectClientById}
          />
        </section>

        {/* Right / Secondary Column: Expiring Memberships & Today's Attendance & Quick Lookup (5 cols on desktop) */}
        <section className="lg:col-span-5 space-y-6" aria-labelledby="sidebar-operations-heading">
          <h2 id="sidebar-operations-heading" className="sr-only">
            Expiring Memberships & Live Attendance
          </h2>

          {/* Quick Client Search & Inspection */}
          <TrainerClientLookup
            selectedClient={selectedClient}
            onSelectClient={(client) => setSelectedClient(client)}
            onClearSelection={() => setSelectedClient(null)}
          />

          {/* Selected Client Inspection Flyout / Card */}
          {selectedClient && (
            <Card className="border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/30">
              <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-bold text-indigo-900 dark:text-indigo-200">
                  Client Inspection: {selectedClient.fullName}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedClient(null)}
                  className="text-xs text-indigo-600 dark:text-indigo-300"
                >
                  Close
                </Button>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-1.5 text-xs text-indigo-900 dark:text-indigo-200">
                <p>
                  <strong>Client ID:</strong> {selectedClient.id}
                </p>
                <p>
                  <strong>Email:</strong> {selectedClient.email}
                </p>
                <div className="flex items-center space-x-1">
                  <strong>Status:</strong>
                  <Badge variant="secondary" size="sm">
                    {selectedClient.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Memberships Expiring Soon Section */}
          <ExpiringMembershipsSection
            expiringItems={expiringData?.items ?? []}
            totalExpiring={expiringData?.total ?? 0}
            horizonDays={expiringData?.horizonDays ?? 7}
            isLoading={isLoadingExpiring}
            isError={isErrorExpiring}
            onRetry={refetchExpiring}
            onSelectClient={handleSelectClientById}
          />

          {/* Today's Check-Ins Attendance Feed */}
          <TrainerAttendanceFeed
            attendanceItems={attendanceData?.items ?? []}
            totalVisits={attendanceData?.total ?? 0}
            grantedCount={attendanceData?.grantedCount ?? 0}
            isLoading={isLoadingAttendance}
            isError={isErrorAttendance}
            isFetching={isFetchingAttendance}
            onRetry={refetchAttendance}
            onSelectClient={handleSelectClientById}
          />
        </section>
      </div>
    </div>
  );
};
