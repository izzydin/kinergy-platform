import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card } from '@kinergy-platform/ui';

export const AssetEditPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="space-y-6" data-testid="asset-edit-page">
      <div>
        <Link
          to={`/resources/assets/${id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to Asset Overview
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-foreground mt-2">
          Edit Asset Details: {id}
        </h1>
        <p className="text-sm text-muted-foreground">
          Update descriptive metadata and notes. Status, location, and condition are updated via
          dedicated operations.
        </p>
      </div>

      <Card className="p-6">
        <p className="text-sm text-muted-foreground">
          Asset descriptive metadata update form boundary.
        </p>
      </Card>
    </div>
  );
};
