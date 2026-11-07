import React from 'react';
import { Card, CardContent, Button, Badge } from '@kinergy-platform/ui';
import { User, UserCheck, RefreshCw, X } from 'lucide-react';
import { ClientSelector } from '../../../gym/memberships/components/client-selector';
import type { ClientModel } from '../../../client/types/client.types';

export interface PosClientSelectorProps {
  selectedClientId?: string;
  selectedClient?: ClientModel | null;
  isWalkIn: boolean;
  onSelectClient: (clientId: string, client?: ClientModel | null) => void;
  onToggleWalkIn: (isWalkIn: boolean) => void;
  disabled?: boolean;
}

export const PosClientSelector: React.FC<PosClientSelectorProps> = ({
  selectedClientId,
  selectedClient,
  isWalkIn,
  onSelectClient,
  onToggleWalkIn,
  disabled = false,
}) => {
  return (
    <Card className="border-border bg-card" data-testid="pos-client-selector">
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Customer Selection</span>
            {isWalkIn ? (
              <Badge variant="secondary" className="text-[11px] font-normal">
                Walk-in Guest
              </Badge>
            ) : selectedClientId ? (
              <Badge
                variant="outline"
                className="text-[11px] font-normal border-primary text-primary"
              >
                Identified Client
              </Badge>
            ) : null}
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={!isWalkIn ? 'default' : 'outline'}
              size="sm"
              onClick={() => onToggleWalkIn(false)}
              disabled={disabled}
              className="h-7 text-xs px-2.5"
              data-testid="pos-mode-client-btn"
            >
              <UserCheck className="h-3.5 w-3.5 mr-1" /> Registered Client
            </Button>
            <Button
              type="button"
              variant={isWalkIn ? 'default' : 'outline'}
              size="sm"
              onClick={() => onToggleWalkIn(true)}
              disabled={disabled}
              className="h-7 text-xs px-2.5"
              data-testid="pos-mode-walkin-btn"
            >
              <User className="h-3.5 w-3.5 mr-1" /> Walk-in / Guest
            </Button>
          </div>
        </div>

        {isWalkIn ? (
          <div
            className="flex items-center justify-between p-3 rounded-lg border border-dashed border-border bg-muted/30 text-xs"
            data-testid="pos-walkin-summary"
          >
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-semibold">
                ?
              </div>
              <div>
                <p className="font-medium text-foreground">Anonymous Walk-in Customer</p>
                <p className="text-[11px] text-muted-foreground">
                  Retail purchase (food, beverages, goods) without recording customer account
                  profile.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onToggleWalkIn(false)}
              className="text-xs h-7 text-primary"
            >
              Assign Client
            </Button>
          </div>
        ) : selectedClientId && selectedClient ? (
          <div
            className="flex items-center justify-between p-3 rounded-lg border border-primary/20 bg-primary/5 text-xs"
            data-testid="pos-selected-client-card"
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs">
                {selectedClient.fullName
                  ? selectedClient.fullName
                      .split(' ')
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase()
                  : 'CL'}
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground text-sm">
                    {selectedClient.fullName || 'Selected Client'}
                  </span>
                  {selectedClient.referenceNumber && (
                    <Badge variant="outline" className="text-[10px] py-0 px-1 font-mono">
                      {selectedClient.referenceNumber}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground text-[11px]">
                  {selectedClient.phone && <span>📞 {selectedClient.phone}</span>}
                  {selectedClient.email && <span>✉️ {selectedClient.email}</span>}
                  <span>ID: {selectedClient.id}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onSelectClient('', null)}
                disabled={disabled}
                className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
                data-testid="pos-change-client-btn"
              >
                <RefreshCw className="h-3 w-3 mr-1" /> Change
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onToggleWalkIn(true)}
                disabled={disabled}
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                aria-label="Switch to walk-in"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <label
              htmlFor="pos-client-search"
              className="text-xs font-medium text-foreground block"
            >
              Search & Select Customer *
            </label>
            <ClientSelector
              id="pos-client-search"
              value={selectedClientId}
              onChange={(clientId, client) => onSelectClient(clientId, client)}
              disabled={disabled}
              placeholder="Search by client name, phone number, or client code..."
              autoFocus
              data-testid="pos-client-combobox"
            />
            <p className="text-[11px] text-muted-foreground">
              Search active clients by name, phone, or code. To sell without a client, click
              "Walk-in / Guest".
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
