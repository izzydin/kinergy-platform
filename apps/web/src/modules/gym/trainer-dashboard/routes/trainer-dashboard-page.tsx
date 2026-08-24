import React, { useState, useEffect } from 'react';
import { Button, Badge, Card, CardHeader, CardTitle, CardContent } from '@kinergy-platform/ui';
import { useAuth } from '../../../../app/providers/auth-provider';
import {
  useTrainerDashboardSummary,
  useAssignedClients,
  useExpiringMemberships,
  useTrainerAttendance,
  useTrainerFilters,
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

  const {
    clientParams,
    page,
    limit,
    sortBy,
    sortOrder,
    searchTerm,
    statusFilter,
    selectedClientId,
    setSearch,
    setPage,
    setLimit,
    setStatusFilter,
    setSelectedClientId,
    setRosterSort,
  } = useTrainerFilters();

  const [selectedClient, setSelectedClient] = useState<ClientSearchResultDTO | null>(null);

  // Sync URL selectedClientId with local selectedClient state on mount or change
  useEffect(() => {
    if (selectedClientId && (!selectedClient || selectedClient.id !== selectedClientId)) {
      setSelectedClient({
        id: selectedClientId,
        fullName: selectedClientId,
        email: `${selectedClientId}@kinergy.client`,
        status: 'ACTIVE',
      });
    } else if (!selectedClientId && selectedClient) {
      setSelectedClient(null);
    }
  }, [selectedClientId, selectedClient]);

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
    ...clientParams,
    trainerId: trainerId || undefined,
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

  // 4. Scoped Attendance Stream (Today's check-ins for assigned clients)
  const {
    data: attendanceData,
    isLoading: isLoadingAttendance,
    isError: isErrorAttendance,
    isFetching: isFetchingAttendance,
    refetch: refetchAttendance,
  } = useTrainerAttendance({
    trainerId: trainerId || undefined,
    page: 1,
    limit: 20,
  });

  // Select client from roster or quick lookup
  const handleSelectClient = (client: ClientSearchResultDTO) => {
    setSelectedClient(client);
    setSelectedClientId(client.id);
  };

  const handleSelectClientById = (clientId: string) => {
    const foundInRoster = assignedClientsData?.items.find((item) => item.clientId === clientId);
    const clientDto: ClientSearchResultDTO = {
      id: clientId,
      fullName: foundInRoster ? foundInRoster.planName : clientId,
      email: `${clientId}@kinergy.client`,
      status: foundInRoster ? foundInRoster.status : 'ACTIVE',
    };
    setSelectedClient(clientDto);
    setSelectedClientId(clientId);
  };

  const handleClearSelectedClient = () => {
    setSelectedClient(null);
    setSelectedClientId(undefined);
  };

  const handleRefreshAll = () => {
    refetchSummary();
    refetchClients();
    refetchExpiring();
    refetchAttendance();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Top Header & Context */}
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
              {currentUser?.email ?? 'Assigned Trainer'}
            </span>
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <Button variant="outline" size="sm" onClick={handleRefreshAll} className="text-xs">
            🔄 Refresh Dashboard
          </Button>
        </div>
      </div>

      {/* Top Summary KPI Banner */}
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

      {/* Main 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (8 cols): Assigned Client Roster */}
        <section className="lg:col-span-8 space-y-6" aria-labelledby="assigned-clients-heading">
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
            onPageChange={setPage}
            onLimitChange={setLimit}
            onSortChange={setRosterSort}
            onStatusFilterChange={setStatusFilter}
            onSearchChange={setSearch}
            onRetry={refetchClients}
            onSelectClient={handleSelectClientById}
          />
        </section>

        {/* Right Column (4 cols): Quick Lookup, Expiring Memberships & Recent Arrivals */}
        <section className="lg:col-span-4 space-y-6" aria-labelledby="sidebar-operations-heading">
          <h2 id="sidebar-operations-heading" className="sr-only">
            Quick Operational Actions
          </h2>

          {/* Quick Client Search & Real-Time Eligibility Card */}
          <TrainerClientLookup
            selectedClient={selectedClient}
            onSelectClient={handleSelectClient}
            onClearSelection={handleClearSelectedClient}
          />

          {/* Selected Client Overview Card */}
          {selectedClient && (
            <Card
              className="bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/60 shadow-sm"
              data-testid="selected-client-inspection-card"
            >
              <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                  Client Inspection: {selectedClient.fullName}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-900"
                  onClick={handleClearSelectedClient}
                >
                  ✕ Close
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
