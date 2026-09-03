import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card } from '@kinergy-platform/ui';

export const AssetHistoryPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="space-y-6" data-testid="asset-history-page">
      <div>
        <Link
          to={`/resources/assets/${id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to Asset Overview
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-foreground mt-2">
          Lifecycle Audit History: {id}
        </h1>
        <p className="text-sm text-muted-foreground">
          Immutable audit trail of status transitions, physical relocations, condition re-ratings,
          and maintenance events.
        </p>
      </div>

      <Card className="p-6">
        <p className="text-sm text-muted-foreground">
          Audit history ledger and chronological timeline boundary.
        </p>
      </Card>
    </div>
  );
};
