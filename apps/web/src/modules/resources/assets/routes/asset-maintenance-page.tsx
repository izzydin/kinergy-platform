import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card } from '@kinergy-platform/ui';

export const AssetMaintenancePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="space-y-6" data-testid="asset-maintenance-page">
      <div>
        <Link
          to={`/resources/assets/${id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to Asset Overview
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-foreground mt-2">
          Maintenance & Servicing Ledger: {id}
        </h1>
        <p className="text-sm text-muted-foreground">
          Historical work orders, service dates, technician logs, and direct maintenance costs.
        </p>
      </div>

      <Card className="p-6">
        <p className="text-sm text-muted-foreground">
          Maintenance history table and work order log boundary.
        </p>
      </Card>
    </div>
  );
};
