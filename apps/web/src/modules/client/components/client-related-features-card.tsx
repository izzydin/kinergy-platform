import React from 'react';
import { Link } from 'react-router-dom';
import { Stethoscope, Dumbbell, Receipt, ArrowRight, Lock } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, Button } from '@kinergy-platform/ui';

export interface ClientRelatedFeaturesCardProps {
  clientId: string;
  canReadKinesiology?: boolean;
  canReadMemberships?: boolean;
  canReadSales?: boolean;
}

export const ClientRelatedFeaturesCard: React.FC<ClientRelatedFeaturesCardProps> = ({
  clientId,
  canReadKinesiology = false,
  canReadMemberships = false,
  canReadSales = false,
}) => {
  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="pb-3 border-b border-border">
        <CardTitle className="text-base font-semibold text-foreground">
          Cross-Domain Operational Workflows
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-0.5">
          Authoritative entry points into clinical charting, active gym memberships, and commercial
          sales ledgers.
        </p>
      </CardHeader>
      <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 1. Clinical Treatment History */}
        <div className="flex flex-col justify-between p-4 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-status-info-surface text-status-info">
                <Stethoscope className="h-4 w-4" aria-hidden="true" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Treatment History</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Clinical SOAP charting, functional muscle assessments, and treatment documentation.
            </p>
          </div>

          <div className="pt-2 border-t border-border">
            {canReadKinesiology ? (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="w-full text-xs justify-between"
              >
                <Link
                  to={`/clients/${encodeURIComponent(clientId)}/treatments`}
                  aria-label="View clinical treatment records for this client"
                  data-testid="link-treatment-history"
                >
                  <span>View Clinical Records</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </Button>
            ) : (
              <div
                className="flex items-center gap-1.5 text-xs text-muted-foreground py-1"
                data-testid="locked-treatment-history"
              >
                <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                <span>Requires kinesiology.sessions.read</span>
              </div>
            )}
          </div>
        </div>

        {/* 2. Gym Facility Memberships */}
        <div className="flex flex-col justify-between p-4 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-brand-soft text-brand-forest">
                <Dumbbell className="h-4 w-4" aria-hidden="true" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Gym Memberships</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Active facility access agreements, recurring subscriptions, and check-in eligibility.
            </p>
          </div>

          <div className="pt-2 border-t border-border">
            {canReadMemberships ? (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="w-full text-xs justify-between"
              >
                <Link
                  to={`/gym/memberships?clientId=${encodeURIComponent(clientId)}`}
                  aria-label="View gym memberships for this client"
                  data-testid="link-gym-memberships"
                >
                  <span>View Memberships</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </Button>
            ) : (
              <div
                className="flex items-center gap-1.5 text-xs text-muted-foreground py-1"
                data-testid="locked-gym-memberships"
              >
                <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                <span>Requires memberships.read</span>
              </div>
            )}
          </div>
        </div>

        {/* 3. Commercial Sales & Invoices */}
        <div className="flex flex-col justify-between p-4 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-status-warning-surface text-status-warning">
                <Receipt className="h-4 w-4" aria-hidden="true" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Commercial Sales</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Point-of-sale invoices, itemized receipts, and transaction payment history.
            </p>
          </div>

          <div className="pt-2 border-t border-border">
            {canReadSales ? (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="w-full text-xs justify-between"
              >
                <Link
                  to={`/sales/list?clientId=${encodeURIComponent(clientId)}`}
                  aria-label="View commercial sales records for this client"
                  data-testid="link-commercial-sales"
                >
                  <span>View Commercial History</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </Button>
            ) : (
              <div
                className="flex items-center gap-1.5 text-xs text-muted-foreground py-1"
                data-testid="locked-commercial-sales"
              >
                <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                <span>Requires sales.read</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
