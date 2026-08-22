import React, { useState, useMemo } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Badge,
  Spinner,
  Alert,
} from '@kinergy-platform/ui';
import { useAuth } from '../../../../app/providers/auth-provider';
import { useAssignedClients } from '../hooks/use-assigned-clients';
import { useExpiringClients } from '../hooks/use-expiring-clients';
import { useTodayAssignedCheckIns } from '../hooks/use-today-assigned-check-ins';
import { AssignedClientCard } from '../components/assigned-client-card';
import { TrainerCheckInRow } from '../components/trainer-check-in-row';
import { TrainerClientLookup } from '../components/trainer-client-lookup';
import { ClientSearchResultDTO } from '../types';

type FilterTab = 'ALL' | 'EXPIRING' | 'ACTIVE' | 'FROZEN';

export const TrainerDashboardPage: React.FC = () => {
  const { currentUser } = useAuth();
  const trainerId = currentUser?.id ?? 'default_trainer';

  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');
  const [selectedClient, setSelectedClient] = useState<ClientSearchResultDTO | null>(null);

  // 1. My Assigned Clients Query
  const {
    data: assignedMemberships = [],
    isLoading: isLoadingAssigned,
    error: assignedError,
    refetch: refetchAssigned,
    isFetching: isFetchingAssigned,
  } = useAssignedClients({
    trainerId,
    horizonDays: 7,
  });

  // 2. Expiring Soon Query (Scoped to this Trainer)
  const { data: expiringMemberships = [] } = useExpiringClients({
    trainerId,
    horizonDays: 7,
  });

  // Extract assigned client IDs for scoping today's attendance
  const assignedClientIds = useMemo(
    () => assignedMemberships.map((m) => m.clientId),
    [assignedMemberships],
  );

  // 3. Today's Check-Ins (Assigned Clients Only, 30s polling)
  const {
    data: todayCheckIns = [],
    isLoading: isLoadingCheckIns,
    isFetching: isFetchingCheckIns,
  } = useTodayAssignedCheckIns(trainerId, assignedClientIds);

  // Filter assigned memberships by tab
  const filteredMemberships = useMemo(() => {
    switch (activeTab) {
      case 'EXPIRING':
        return assignedMemberships.filter((m) => m.isExpiringSoon);
      case 'ACTIVE':
        return assignedMemberships.filter((m) => m.status === 'ACTIVE');
      case 'FROZEN':
        return assignedMemberships.filter((m) => m.status === 'FROZEN' || m.isCurrentlyFrozen);
      case 'ALL':
      default:
        return assignedMemberships;
    }
  }, [assignedMemberships, activeTab]);

  // Statistics Summary
  const stats = useMemo(() => {
    const total = assignedMemberships.length;
    const active = assignedMemberships.filter((m) => m.status === 'ACTIVE').length;
    const expiring = assignedMemberships.filter((m) => m.isExpiringSoon).length;
    const frozen = assignedMemberships.filter(
      (m) => m.status === 'FROZEN' || m.isCurrentlyFrozen,
    ).length;
    const todayVisits = todayCheckIns.filter((c) => c.result === 'GRANTED').length;

    return { total, active, expiring, frozen, todayVisits };
  }, [assignedMemberships, todayCheckIns]);

  const handleSelectClientById = (clientId: string) => {
    const match = assignedMemberships.find((m) => m.clientId === clientId);
    setSelectedClient({
      id: clientId,
      fullName: match ? `Client (${clientId})` : clientId,
      email: `${clientId}@kinergy.client`,
      status: match?.status ?? 'ACTIVE',
    });
  };

  return (
    <div
      className="container mx-auto p-4 md:p-6 space-y-6 max-w-7xl"
      data-testid="trainer-dashboard-page"
    >
      {/* Header & Role Context */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Trainer Operational Dashboard
            </h1>
            <Badge
              variant="outline"
              className="bg-primary/10 text-primary border-primary/20 text-xs px-2 py-0.5"
            >
              Gym Floor Operations
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time daily operations for assigned clients, membership expirations, and facility
            attendance.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchAssigned()}
            disabled={isFetchingAssigned}
            className="text-xs h-8"
          >
            {isFetchingAssigned ? <Spinner size="sm" className="mr-1.5" /> : '↻ '}
            Refresh
          </Button>
        </div>
      </div>

      {/* Operational KPI Metric Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-card shadow-sm border-border/70 p-3.5">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">
            My Assigned Clients
          </span>
          <div
            className="text-2xl font-bold text-foreground mt-1 font-mono"
            data-testid="kpi-assigned-clients"
          >
            {isLoadingAssigned ? '-' : stats.total}
          </div>
          <span className="text-[11px] text-muted-foreground mt-0.5 block">
            {stats.active} active agreements
          </span>
        </Card>

        <Card className="bg-card shadow-sm border-border/70 p-3.5">
          <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider block">
            Expiring Soon (7d)
          </span>
          <div
            className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1 font-mono"
            data-testid="kpi-expiring-soon"
          >
            {isLoadingAssigned ? '-' : stats.expiring}
          </div>
          <span className="text-[11px] text-muted-foreground mt-0.5 block">
            Require renewal reminder
          </span>
        </Card>

        <Card className="bg-card shadow-sm border-border/70 p-3.5">
          <span className="text-[11px] font-medium text-sky-600 dark:text-sky-400 uppercase tracking-wider block">
            Currently Frozen
          </span>
          <div
            className="text-2xl font-bold text-sky-600 dark:text-sky-400 mt-1 font-mono"
            data-testid="kpi-currently-frozen"
          >
            {isLoadingAssigned ? '-' : stats.frozen}
          </div>
          <span className="text-[11px] text-muted-foreground mt-0.5 block">
            Temporary pause active
          </span>
        </Card>

        <Card className="bg-card shadow-sm border-border/70 p-3.5">
          <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">
            Checked In Today
          </span>
          <div
            className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 font-mono"
            data-testid="kpi-today-checkins"
          >
            {isLoadingCheckIns ? '-' : stats.todayVisits}
          </div>
          <span className="text-[11px] text-muted-foreground mt-0.5 block">
            Assigned member arrivals
          </span>
        </Card>
      </div>

      {/* Proactive Expiring Soon Alert Notice */}
      {expiringMemberships.length > 0 && (
        <Alert
          variant="default"
          className="bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">
              🔔 {expiringMemberships.length} of your assigned clients have memberships expiring
              within the next 7 days.
            </span>
            <Button
              variant="outline"
              size="sm"
              className="text-[11px] h-6 px-2 border-amber-500/40 hover:bg-amber-500/20 text-amber-900 dark:text-amber-200"
              onClick={() => setActiveTab('EXPIRING')}
            >
              View Expiring
            </Button>
          </div>
        </Alert>
      )}

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Assigned Clients Directory & Feed (8 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Assigned Clients Card */}
          <Card className="bg-card shadow-sm border-border/80">
            <CardHeader className="pb-3 border-b border-border/40 flex flex-row items-center justify-between">
              <div className="flex items-center space-x-2">
                <CardTitle className="text-sm font-semibold text-foreground">
                  My Assigned Clients
                </CardTitle>
                {isFetchingAssigned && <Spinner size="sm" />}
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center space-x-1">
                {(['ALL', 'EXPIRING', 'ACTIVE', 'FROZEN'] as FilterTab[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                      activeTab === tab
                        ? 'bg-primary text-primary-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                    }`}
                    data-testid={`filter-tab-${tab.toLowerCase()}`}
                  >
                    {tab === 'ALL'
                      ? `All (${stats.total})`
                      : tab === 'EXPIRING'
                        ? `Expiring (${stats.expiring})`
                        : tab === 'ACTIVE'
                          ? `Active (${stats.active})`
                          : `Frozen (${stats.frozen})`}
                  </button>
                ))}
              </div>
            </CardHeader>

            <CardContent className="p-4">
              {isLoadingAssigned ? (
                <div className="p-8 text-center flex flex-col items-center justify-center space-y-2">
                  <Spinner size="md" />
                  <p className="text-xs text-muted-foreground">
                    Loading your assigned client list...
                  </p>
                </div>
              ) : assignedError ? (
                <Alert variant="destructive" className="text-xs">
                  Failed to load assigned clients: {assignedError.message}
                </Alert>
              ) : filteredMemberships.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground border border-dashed border-border/60 rounded-md">
                  {activeTab === 'EXPIRING'
                    ? 'No memberships expiring in the next 7 days for your assigned clients.'
                    : activeTab === 'FROZEN'
                      ? 'No clients currently on frozen membership status.'
                      : 'You have no clients currently assigned to you.'}
                </div>
              ) : (
                <div
                  className="grid grid-cols-1 md:grid-cols-2 gap-3"
                  data-testid="assigned-clients-grid"
                >
                  {filteredMemberships.map((client) => (
                    <AssignedClientCard
                      key={client.membershipId}
                      client={client}
                      onSelectClient={handleSelectClientById}
                      isSelected={selectedClient?.id === client.clientId}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Today's Ingress / Check-In Feed for Assigned Clients */}
          <Card className="bg-card shadow-sm border-border/80">
            <CardHeader className="pb-3 border-b border-border/40 flex flex-row items-center justify-between">
              <div className="flex items-center space-x-2">
                <CardTitle className="text-sm font-semibold text-foreground">
                  Today&apos;s Check-Ins (My Clients)
                </CardTitle>
                {isFetchingCheckIns && <Spinner size="sm" />}
              </div>
              <span className="text-[11px] text-muted-foreground font-mono">Auto-refresh: 30s</span>
            </CardHeader>

            <CardContent className="p-0">
              {isLoadingCheckIns ? (
                <div className="p-6 text-center flex flex-col items-center justify-center space-y-2">
                  <Spinner size="sm" />
                  <p className="text-xs text-muted-foreground">
                    Checking today&apos;s arrival records...
                  </p>
                </div>
              ) : todayCheckIns.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  None of your assigned clients have checked in today yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table
                    className="w-full text-left text-xs border-collapse"
                    data-testid="trainer-today-checkins-table"
                  >
                    <thead>
                      <tr className="border-b border-border/40 bg-muted/30 text-muted-foreground font-medium">
                        <th className="py-2 px-3">Time</th>
                        <th className="py-2 px-3">Client</th>
                        <th className="py-2 px-3">Method</th>
                        <th className="py-2 px-3">Access Outcome</th>
                        <th className="py-2 px-3">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {todayCheckIns.map((item) => (
                        <TrainerCheckInRow
                          key={item.id}
                          item={item}
                          onSelectClient={handleSelectClientById}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Search & Live Eligibility Inspector (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          <TrainerClientLookup
            selectedClient={selectedClient}
            onSelectClient={setSelectedClient}
            onClearSelection={() => setSelectedClient(null)}
          />
        </div>
      </div>
    </div>
  );
};
