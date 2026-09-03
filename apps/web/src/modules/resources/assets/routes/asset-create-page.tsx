import React from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@kinergy-platform/ui';

export const AssetCreatePage: React.FC = () => {
  return (
    <div className="space-y-6" data-testid="asset-create-page">
      <div>
        <Link
          to="/resources/assets"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to Assets
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-foreground mt-2">
          Commission New Fixed Asset
        </h1>
        <p className="text-sm text-muted-foreground">
          Register, classify, and allocate physical capital equipment to facilities.
        </p>
      </div>

      <Card className="p-6">
        <p className="text-sm text-muted-foreground">Asset onboarding form boundary.</p>
      </Card>
    </div>
  );
};
