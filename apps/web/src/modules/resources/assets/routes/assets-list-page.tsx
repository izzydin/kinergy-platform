import React from 'react';
import { Card, Button } from '@kinergy-platform/ui';
import { Link } from 'react-router-dom';
import { HasPermission } from '../../../../app/routes/permission-guard';

export const AssetsListPage: React.FC = () => {
  return (
    <div className="space-y-6" data-testid="assets-list-page">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Fixed Assets</h1>
          <p className="text-sm text-muted-foreground">
            Monitor, service, and audit physical equipment, machinery, and facility assets.
          </p>
        </div>
        <HasPermission name="assets.write">
          <Button asChild>
            <Link to="/resources/assets/new">Commission New Asset</Link>
          </Button>
        </HasPermission>
      </div>

      <Card className="p-6">
        <p className="text-sm text-muted-foreground">
          Fixed Assets catalog table and filtering cockpit boundary.
        </p>
      </Card>
    </div>
  );
};
