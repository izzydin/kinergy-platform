import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@kinergy-platform/ui';
import {
  ClientSearchBar,
  MembershipEligibilityCard,
  CheckInActionPanel,
  TodayAttendanceTable,
  ClientAttendanceHistoryDialog,
} from '../components';
import { ClientSearchResultDTO, RecordCheckInResponseVM } from '../types';
import { useClientEligibility } from '../hooks/use-gym-attendance';
import { useAttendanceFilters } from '../hooks/use-attendance-filters';

export const AttendancePage: React.FC = () => {
  const { clientId, historyClientId, setClientId, setHistoryClientId } = useAttendanceFilters();

  const [selectedClient, setSelectedClient] = useState<ClientSearchResultDTO | null>(null);

  // Synchronize URL clientId with selectedClient state on direct URL mount/change
  useEffect(() => {
    if (clientId && (!selectedClient || selectedClient.id !== clientId)) {
      setSelectedClient({
        id: clientId,
        fullName: clientId,
        email: '',
        status: 'ACTIVE',
      });
    } else if (!clientId && selectedClient) {
      setSelectedClient(null);
    }
  }, [clientId, selectedClient]);

  const { data: eligibility } = useClientEligibility(selectedClient?.id);

  const handleSelectClient = (client: ClientSearchResultDTO) => {
    setSelectedClient(client);
    setClientId(client.id);
  };

  const handleClearSelection = () => {
    setSelectedClient(null);
    setClientId(undefined);
  };

  const handleCheckInSuccess = (_result: RecordCheckInResponseVM) => {
    // Receptionist can continue or inspect next member
  };

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-7xl" data-testid="attendance-page">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-4 border-b border-border/40">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">
            Gym Attendance &amp; Ingress Control
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
            Identify members, verify live authoritative membership eligibility, and record
            admissions.
          </p>
        </div>
        <div className="flex items-center space-x-2 text-xs font-mono text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-md border border-border/40 self-start md:self-auto">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Access Control Terminal Active</span>
        </div>
      </div>

      {/* 2-Column Operational Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Member Search, Eligibility & Ingress Action (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground uppercase tracking-wider block">
              1. Identify Member
            </label>
            <ClientSearchBar
              onSelectClient={handleSelectClient}
              selectedClient={selectedClient}
              onClearSelection={handleClearSelection}
              autoFocus
            />
          </div>

          {selectedClient ? (
            <div className="space-y-4 pt-1" data-testid="admission-action-container">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground uppercase tracking-wider block">
                  2. Authoritative Eligibility
                </label>
                <MembershipEligibilityCard clientId={selectedClient.id} />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground uppercase tracking-wider block">
                  3. Authorize Admission
                </label>
                <CheckInActionPanel
                  clientId={selectedClient.id}
                  isEligible={Boolean(eligibility?.isEligible)}
                  onCheckInSuccess={handleCheckInSuccess}
                />
              </div>
            </div>
          ) : (
            <Card className="bg-muted/10 border-dashed border-border/80">
              <CardContent className="p-8 text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary mx-auto flex items-center justify-center text-lg font-bold">
                  🔍
                </div>
                <h4 className="text-sm font-medium text-foreground">Ready for Member Scan</h4>
                <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                  Type a member name, ID, or scan a badge to verify authoritative backend
                  eligibility.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column: Today's Live Attendance Feed & Real-Time KPIs (7 cols) */}
        <div className="lg:col-span-7">
          <TodayAttendanceTable onInspectClientHistory={(id) => setHistoryClientId(id)} />
        </div>
      </div>

      {/* Client Attendance History Modal Dialog */}
      <ClientAttendanceHistoryDialog
        clientId={historyClientId ?? null}
        open={Boolean(historyClientId)}
        onOpenChange={(open) => {
          if (!open) setHistoryClientId(undefined);
        }}
      />
    </div>
  );
};
