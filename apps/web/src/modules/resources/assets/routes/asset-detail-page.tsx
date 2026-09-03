import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, Button } from '@kinergy-platform/ui';
import { HasPermission } from '../../../../app/routes/permission-guard';

export const AssetDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="space-y-6" data-testid="asset-detail-page">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link
              to="/resources/assets"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Back to Assets
            </Link>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Asset Overview: {id}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <HasPermission name="assets.write">
            <Button variant="outline" asChild>
              <Link to={`/resources/assets/${id}/edit`}>Edit Details</Link>
            </Button>
          </HasPermission>
          <Button variant="outline" asChild>
            <Link to={`/resources/assets/${id}/history`}>Audit History</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to={`/resources/assets/${id}/maintenance`}>Maintenance Log</Link>
          </Button>
        </div>
      </div>

      <Card className="p-6">
        <p className="text-sm text-muted-foreground">
          Equipment cockpit, lifecycle status transitions, and location management boundary.
        </p>
      </Card>
    </div>
  );
};
