import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Badge } from '@kinergy-platform/ui';
import { Layers, PlusCircle } from 'lucide-react';
import { HasPermission } from '../../../../app/routes/permission-guard';
import { AssetOverviewSummary } from '../components/asset-overview-summary';
import { AssetAttentionQueue } from '../components/asset-attention-queue';
import type { FixedAssetVM } from '../types';

export const AssetOverviewPage: React.FC = () => {
  const navigate = useNavigate();

  const handleCommissionAsset = () => {
    navigate('/resources/assets/new');
  };

  const handleServiceAsset = (asset: FixedAssetVM) => {
    navigate(`/resources/assets/${asset.id}/maintenance`);
  };

  return (
    <div className="space-y-6" data-testid="asset-overview-page">
      {/* 1. Page Header Block */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Fixed Assets Overview
            </h1>
            <Badge
              variant="outline"
              className="hidden sm:inline-flex border-primary/30 text-primary"
            >
              Operational Cockpit
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Physical capital equipment status, maintenance attention queue, and balance sheet
            carrying valuation.
          </p>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2.5">
          <Button asChild variant="outline" size="sm">
            <Link to="/resources/assets">
              <Layers className="mr-1.5 h-4 w-4" /> Full Catalog
            </Link>
          </Button>
          <HasPermission name="assets.write">
            <Button variant="default" size="sm" onClick={handleCommissionAsset}>
              <PlusCircle className="mr-1.5 h-4 w-4" /> Commission Asset
            </Button>
          </HasPermission>
        </div>
      </div>

      {/* 2. Top-Level Operational KPI Cards */}
      <AssetOverviewSummary onCommissionAssetClick={handleCommissionAsset} />

      {/* 3. Maintenance & Damage Attention Queue */}
      <AssetAttentionQueue onServiceAssetClick={handleServiceAsset} />
    </div>
  );
};
