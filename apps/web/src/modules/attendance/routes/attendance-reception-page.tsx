import React, { useState } from 'react';
import { Card, CardContent } from '@kinergy-platform/ui';
import { ClientSearchBar } from '../components/client-search-bar';
import { MembershipEligibilityCard } from '../components/membership-eligibility-card';
import { CheckInActionPanel } from '../components/check-in-action-panel';
import { TodayAttendanceTable } from '../components/today-attendance-table';
import { ClientSearchResultDTO, RecordCheckInResultDTO } from '../types';
import { useClientEligibility } from '../hooks/use-attendance';

export const AttendanceReceptionPage: React.FC = () => {
  const [selectedClient, setSelectedClient] = useState<ClientSearchResultDTO | null>(null);

  const { data: eligibility } = useClientEligibility(selectedClient?.id);

  const handleSelectClient = (client: ClientSearchResultDTO) => {
    setSelectedClient(client);
  };

  const handleClearSelection = () => {
    setSelectedClient(null);
  };

  const handleCheckInSuccess = (_result: RecordCheckInResultDTO) => {
    // Keep client selected or reset according to reception preference
  };

  return (
    <div
      className="container mx-auto p-4 md:p-6 space-y-6 max-w-7xl"
      data-testid="attendance-reception-page"
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-4 border-b border-border/40">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">
            Gym Admission & Reception
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
            Search members, verify live membership status, and process physical access admissions.
          </p>
        </div>
        <div className="flex items-center space-x-2 text-xs font-mono text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-md border border-border/40 self-start md:self-auto">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Access Control Active</span>
        </div>
      </div>

      {/* 2-Column Operational Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Client Discovery, Eligibility Verification & Admission Action (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground uppercase tracking-wider block">
              1. Identify Member
            </label>
            <ClientSearchBar
              onSelectClient={handleSelectClient}
              selectedClient={selectedClient}
              onClearSelection={handleClearSelection}
            />
          </div>

          {selectedClient ? (
            <div className="space-y-4 pt-1" data-testid="admission-action-container">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground uppercase tracking-wider block">
                  2. Verify Backend Eligibility
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
                  Type a member name, email, or scan an RFID / QR badge to load authoritative
                  eligibility.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column: Today's Live Attendance Feed & Real-time KPIs (7 cols) */}
        <div className="lg:col-span-7">
          <TodayAttendanceTable />
        </div>
      </div>
    </div>
  );
};
