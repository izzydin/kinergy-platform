import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@kinergy-platform/ui';
import { ClientSearchBar, MembershipEligibilityCard } from '../../attendance/components';
import { ClientSearchResultDTO } from '../types';

interface TrainerClientLookupProps {
  readonly selectedClient: ClientSearchResultDTO | null;
  readonly onSelectClient: (client: ClientSearchResultDTO) => void;
  readonly onClearSelection: () => void;
}

export const TrainerClientLookup: React.FC<TrainerClientLookupProps> = ({
  selectedClient,
  onSelectClient,
  onClearSelection,
}) => {
  return (
    <Card className="bg-card shadow-sm border-border/80" data-testid="trainer-client-lookup-card">
      <CardHeader className="pb-3 border-b border-border/40">
        <CardTitle className="text-sm font-semibold text-foreground flex items-center justify-between">
          <span>Client Lookup &amp; Real-Time Eligibility</span>
          {selectedClient && (
            <span className="text-xs font-normal text-muted-foreground">
              Selected: <strong className="text-foreground">{selectedClient.fullName}</strong> (
              {selectedClient.id})
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1.5">
            Search any registered client by Name or Email:
          </label>
          <ClientSearchBar
            selectedClient={selectedClient}
            onSelectClient={onSelectClient}
            onClearSelection={onClearSelection}
          />
        </div>

        {selectedClient ? (
          <div className="pt-2">
            <MembershipEligibilityCard clientId={selectedClient.id} />
          </div>
        ) : (
          <div className="p-6 rounded-md border border-dashed border-border/60 text-center text-xs text-muted-foreground bg-muted/10">
            🔍 Search for a client above or click &ldquo;Check Status&rdquo; on an assigned card to
            inspect authoritative membership status and validity.
          </div>
        )}
      </CardContent>
    </Card>
  );
};
