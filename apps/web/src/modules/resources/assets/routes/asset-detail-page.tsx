import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Button,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Alert,
  AlertDescription,
  AlertTitle,
  Skeleton,
} from '@kinergy-platform/ui';
import {
  ArrowLeft,
  Edit,
  MapPin,
  ShieldAlert,
  Stethoscope,
  Wrench,
  DollarSign,
  History,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Lock,
  Calendar,
  Layers,
  FileText,
  ShieldCheck,
} from 'lucide-react';
import { AssetStatus, ASSET_CONDITION_REGISTRY } from '@kinergy-platform/core';
import { useAuth } from '../../../../app/providers/auth-provider';
import { useAsset, useAssetValuation } from '../hooks';
import {
  AssetStatusBadge,
  AssetConditionBadge,
  AssetCategoryBadge,
  TransferAssetLocationDialog,
  ChangeAssetStatusDialog,
  UpdateAssetConditionDialog,
  RecordAssetMaintenanceDialog,
  UpdateAssetValuationDialog,
  AssetHistoryPreview,
  AssetMaintenancePreview,
} from '../components';

export const AssetDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { hasPermission, hasRole } = useAuth();

  // Active tab state
  const [activeTab, setActiveTab] = useState<'overview' | 'maintenance' | 'history'>('overview');

  // Permission evaluations
  const canWrite =
    hasPermission('assets.write') || hasRole('ADMIN') || hasRole('SUPER_ADMIN') || hasRole('OWNER');

  const canViewValuation =
    hasPermission('billing.read') ||
    hasPermission('valuation.read') ||
    hasRole('ADMIN') ||
    hasRole('SUPER_ADMIN') ||
    hasRole('OWNER');

  // Action Dialog states
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [conditionDialogOpen, setConditionDialogOpen] = useState(false);
  const [maintenanceDialogOpen, setMaintenanceDialogOpen] = useState(false);
  const [valuationDialogOpen, setValuationDialogOpen] = useState(false);

  // Queries
  const { data: asset, isLoading, isError, error: fetchError, refetch } = useAsset(id);
  const { data: valuationData } = useAssetValuation(id, {
    enabled: Boolean(id) && canViewValuation,
  });

  const isDecommissioned =
    asset?.status === AssetStatus.SOLD || asset?.status === AssetStatus.RETIRED;

  // Formatted valuation amounts
  const purchaseCost = valuationData?.purchaseValueAmount ?? asset?.purchaseValueAmount;
  const estimatedFairValue =
    valuationData?.currentEstimatedValueAmount ?? asset?.currentEstimatedValueAmount;

  return (
    <div className="space-y-6 max-w-7xl mx-auto" data-testid="asset-detail-page">
      {/* 1. Top Breadcrumb & Heading Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link
              to="/resources/assets"
              className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center"
            >
              <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to Assets
            </Link>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground mt-1">
            Asset Overview: {id}
          </h1>
          {asset && (
            <p className="text-sm text-muted-foreground font-medium flex items-center gap-2 mt-0.5">
              <span>{asset.name}</span>
              <span>•</span>
              <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded text-foreground">
                {asset.assetTag}
              </span>
            </p>
          )}
        </div>

        {/* Action Controls Bar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Edit Details (Requires assets.write) */}
          {canWrite && (
            <Button variant="outline" size="sm" asChild disabled={isDecommissioned}>
              <Link to={`/resources/assets/${encodeURIComponent(id ?? '')}/edit`}>
                <Edit className="mr-1.5 h-3.5 w-3.5" /> Edit Details
              </Link>
            </Button>
          )}

          {/* Transfer Location (Requires assets.write) */}
          {canWrite && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTransferDialogOpen(true)}
              disabled={isDecommissioned}
            >
              <MapPin className="mr-1.5 h-3.5 w-3.5" /> Transfer
            </Button>
          )}

          {/* Change Status (Requires assets.write) */}
          {canWrite && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStatusDialogOpen(true)}
              disabled={isDecommissioned}
            >
              <ShieldAlert className="mr-1.5 h-3.5 w-3.5" /> Status
            </Button>
          )}

          {/* Log Condition Inspection (Requires assets.write) */}
          {canWrite && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConditionDialogOpen(true)}
              disabled={isDecommissioned}
            >
              <Stethoscope className="mr-1.5 h-3.5 w-3.5" /> Inspect
            </Button>
          )}

          {/* Record Maintenance (Requires assets.write) */}
          {canWrite && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMaintenanceDialogOpen(true)}
              disabled={isDecommissioned}
            >
              <Wrench className="mr-1.5 h-3.5 w-3.5" /> Service
            </Button>
          )}

          {/* Update Valuation (Requires assets.write + billing.read) */}
          {canWrite && canViewValuation && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setValuationDialogOpen(true)}
              disabled={isDecommissioned}
            >
              <DollarSign className="mr-1.5 h-3.5 w-3.5" /> Valuation
            </Button>
          )}

          {/* Direct links to dedicated ledgers */}
          <Button variant="outline" size="sm" asChild>
            <Link to={`/resources/assets/${encodeURIComponent(id ?? '')}/history`}>
              <History className="mr-1.5 h-3.5 w-3.5" /> Audit History
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/resources/assets/${encodeURIComponent(id ?? '')}/maintenance`}>
              <Wrench className="mr-1.5 h-3.5 w-3.5" /> Maintenance Log
            </Link>
          </Button>
        </div>
      </div>

      {/* 2. Loading State */}
      {isLoading && (
        <div className="space-y-6" data-testid="asset-detail-loading">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
      )}

      {/* 3. Error / Not Found State */}
      {isError && (
        <Card
          className="border-destructive/30 bg-destructive/5 text-center p-8"
          data-testid="asset-detail-error"
        >
          <CardContent className="space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold tracking-tight text-foreground">Asset Not Found</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                {fetchError instanceof Error
                  ? fetchError.message
                  : `Unable to locate fixed asset with identifier "${id}". It may have been archived or removed.`}
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="mr-1.5 h-4 w-4" /> Try Again
              </Button>
              <Button asChild size="sm">
                <Link to="/resources/assets">View All Assets</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 4. Hydrated Asset Cockpit */}
      {!isLoading && !isError && asset && (
        <div className="space-y-6">
          {/* Terminal Warning Banner */}
          {isDecommissioned && (
            <Alert
              variant="destructive"
              className="border-destructive/50 bg-destructive/10 text-destructive"
              data-testid="terminal-asset-alert"
            >
              <AlertTriangle className="h-5 w-5" />
              <AlertTitle className="font-semibold tracking-tight">
                Terminal Lifecycle State ({asset.status})
              </AlertTitle>
              <AlertDescription className="text-sm mt-1">
                This asset has been decommissioned ({asset.status}). Per enterprise domain
                invariants <code>[AST-INV-1]</code> and <code>[AST-INV-2]</code>, decommissioned
                equipment cannot be relocated, edited, or have routine maintenance performed.
              </AlertDescription>
            </Alert>
          )}

          {/* Quick Metrics KPI Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Physical Placement */}
            <Card className="border-border bg-card">
              <CardHeader className="p-4 pb-2">
                <CardDescription className="text-xs flex items-center gap-1.5 uppercase font-semibold tracking-wider">
                  <MapPin className="h-3.5 w-3.5 text-primary" /> Current Placement
                </CardDescription>
                <CardTitle className="text-lg font-bold font-mono">
                  {asset.location.facilityId}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 text-xs text-muted-foreground space-y-0.5">
                <p>
                  Room:{' '}
                  <span className="text-foreground font-medium">
                    {asset.location.roomId || 'Unassigned'}
                  </span>
                </p>
                <p>
                  Zone:{' '}
                  <span className="text-foreground font-medium">
                    {asset.location.zone || 'Unassigned'}
                  </span>
                </p>
              </CardContent>
            </Card>

            {/* Card 2: Operational Condition */}
            <Card className="border-border bg-card">
              <CardHeader className="p-4 pb-2">
                <CardDescription className="text-xs flex items-center gap-1.5 uppercase font-semibold tracking-wider">
                  <Stethoscope className="h-3.5 w-3.5 text-primary" /> Physical Condition
                </CardDescription>
                <div className="pt-1">
                  <AssetConditionBadge condition={asset.condition} />
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-2 text-xs text-muted-foreground">
                <p>
                  Rank {ASSET_CONDITION_REGISTRY[asset.condition]?.severityRank ?? ''} •{' '}
                  {ASSET_CONDITION_REGISTRY[asset.condition]?.isServiceable
                    ? 'Fleet Serviceable'
                    : 'Service Required'}
                </p>
              </CardContent>
            </Card>

            {/* Card 3: Capital Carrying Valuation (Permission Protected) */}
            <Card className="border-border bg-card">
              <CardHeader className="p-4 pb-2">
                <CardDescription className="text-xs flex items-center gap-1.5 uppercase font-semibold tracking-wider">
                  <DollarSign className="h-3.5 w-3.5 text-primary" /> Carrying Valuation
                </CardDescription>
                {canViewValuation ? (
                  <CardTitle className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">
                    {typeof estimatedFairValue === 'number'
                      ? `$${estimatedFairValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : typeof purchaseCost === 'number'
                        ? `$${purchaseCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : 'Unrecorded'}
                  </CardTitle>
                ) : (
                  <div className="pt-1">
                    <Badge variant="secondary" className="text-xs">
                      <Lock className="mr-1 h-3 w-3" /> Confidential
                    </Badge>
                  </div>
                )}
              </CardHeader>
              <CardContent className="p-4 pt-0 text-xs text-muted-foreground">
                {canViewValuation ? (
                  <p>
                    Invoice Cost:{' '}
                    {typeof purchaseCost === 'number'
                      ? `$${purchaseCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                      : 'N/A'}
                  </p>
                ) : (
                  <p className="text-[11px]">Requires billing.read clearance</p>
                )}
              </CardContent>
            </Card>

            {/* Card 4: Operational Status */}
            <Card className="border-border bg-card">
              <CardHeader className="p-4 pb-2">
                <CardDescription className="text-xs flex items-center gap-1.5 uppercase font-semibold tracking-wider">
                  <ShieldAlert className="h-3.5 w-3.5 text-primary" /> Fleet Status
                </CardDescription>
                <div className="pt-1">
                  <AssetStatusBadge status={asset.status} />
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <span>Category:</span>
                  <AssetCategoryBadge category={asset.category} />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tab Navigation Controls */}
          <div className="flex items-center gap-2 border-b border-border pb-2">
            <Button
              variant={activeTab === 'overview' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('overview')}
            >
              <FileText className="mr-1.5 h-4 w-4" /> Specifications & Placement
            </Button>
            <Button
              variant={activeTab === 'maintenance' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('maintenance')}
            >
              <Wrench className="mr-1.5 h-4 w-4" /> Maintenance & Servicing
            </Button>
            <Button
              variant={activeTab === 'history' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('history')}
            >
              <History className="mr-1.5 h-4 w-4" /> Lifecycle Audit Ledger
            </Button>
          </div>

          {/* Tab 1: Specifications & Placement */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6" data-testid="tab-overview">
              {/* Hardware Specifications Card */}
              <Card className="border-border bg-card">
                <CardHeader className="p-5 pb-3">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Layers className="h-4 w-4 text-primary" /> Hardware Specifications
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5 pt-0 space-y-4 text-sm">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Asset Tag</p>
                      <p className="font-mono font-semibold text-foreground mt-0.5">
                        {asset.assetTag}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Taxonomy Category</p>
                      <div className="mt-0.5">
                        <AssetCategoryBadge category={asset.category} />
                      </div>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Acquisition Date</p>
                      <p className="font-medium text-foreground mt-0.5 flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        {new Date(asset.purchaseDate).toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Audit Version</p>
                      <p className="font-mono font-medium text-foreground mt-0.5">
                        v{asset.version}
                      </p>
                    </div>
                  </div>

                  {asset.description && (
                    <div className="pt-2 border-t border-border/50">
                      <p className="text-xs font-semibold text-muted-foreground mb-1">
                        Equipment Description
                      </p>
                      <p className="text-xs text-foreground leading-relaxed">{asset.description}</p>
                    </div>
                  )}

                  {asset.notes && (
                    <div className="pt-2 border-t border-border/50">
                      <p className="text-xs font-semibold text-muted-foreground mb-1">
                        Onboarding Notes
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{asset.notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Physical Deployment Card */}
              <Card className="border-border bg-card">
                <CardHeader className="p-5 pb-3">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" /> Deployment Location
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5 pt-0 space-y-4 text-sm">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-md border border-border bg-muted/40 p-2.5">
                      <p className="text-muted-foreground font-semibold text-[10px] uppercase tracking-wider">
                        Facility Campus
                      </p>
                      <p className="font-mono font-bold text-foreground text-sm mt-0.5">
                        {asset.location.facilityId}
                      </p>
                    </div>
                    <div className="rounded-md border border-border bg-muted/40 p-2.5">
                      <p className="text-muted-foreground font-semibold text-[10px] uppercase tracking-wider">
                        Room / Studio
                      </p>
                      <p className="font-semibold text-foreground text-sm mt-0.5">
                        {asset.location.roomId || 'General Floor'}
                      </p>
                    </div>
                    <div className="rounded-md border border-border bg-muted/40 p-2.5">
                      <p className="text-muted-foreground font-semibold text-[10px] uppercase tracking-wider">
                        Micro Zone
                      </p>
                      <p className="font-semibold text-foreground text-sm mt-0.5">
                        {asset.location.zone || 'Unassigned'}
                      </p>
                    </div>
                    <div className="rounded-md border border-border bg-muted/40 p-2.5">
                      <p className="text-muted-foreground font-semibold text-[10px] uppercase tracking-wider">
                        Audit Security
                      </p>
                      <p className="font-semibold text-emerald-600 text-sm mt-0.5 flex items-center gap-1">
                        <ShieldCheck className="h-3.5 w-3.5" /> Verified
                      </p>
                    </div>
                  </div>

                  {asset.location.description && (
                    <div className="pt-2 border-t border-border/50 text-xs">
                      <p className="font-semibold text-muted-foreground mb-1">
                        Placement Landmarks
                      </p>
                      <p className="text-muted-foreground">{asset.location.description}</p>
                    </div>
                  )}

                  {canWrite && !isDecommissioned && (
                    <div className="pt-3 border-t border-border/50 flex justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setTransferDialogOpen(true)}
                      >
                        <MapPin className="mr-1.5 h-3.5 w-3.5" /> Relocate Equipment
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Tab 2: Servicing & Maintenance Work Orders */}
          {activeTab === 'maintenance' && (
            <Card className="border-border bg-card" data-testid="tab-maintenance">
              <CardHeader className="p-5 pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <Wrench className="h-4 w-4 text-primary" /> Recent Maintenance & Work Orders
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      Servicing records, component repairs, and technician work orders.
                    </CardDescription>
                  </div>
                  {canWrite && !isDecommissioned && (
                    <Button size="sm" onClick={() => setMaintenanceDialogOpen(true)}>
                      <Wrench className="mr-1.5 h-3.5 w-3.5" /> Log Service
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-5 pt-0">
                <AssetMaintenancePreview assetId={asset.id} />
              </CardContent>
            </Card>
          )}

          {/* Tab 3: Lifecycle Audit History */}
          {activeTab === 'history' && (
            <Card className="border-border bg-card" data-testid="tab-history">
              <CardHeader className="p-5 pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" /> Chronological Lifecycle Ledger
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Immutable audit trail tracking state transitions, location changes, and
                  inspections.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 pt-0">
                <AssetHistoryPreview assetId={asset.id} />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* 5. Interactive Mutation Dialogs */}
      <TransferAssetLocationDialog
        asset={asset ?? null}
        open={transferDialogOpen}
        onOpenChange={setTransferDialogOpen}
      />
      <ChangeAssetStatusDialog
        asset={asset ?? null}
        open={statusDialogOpen}
        onOpenChange={setStatusDialogOpen}
      />
      <UpdateAssetConditionDialog
        asset={asset ?? null}
        open={conditionDialogOpen}
        onOpenChange={setConditionDialogOpen}
      />
      <RecordAssetMaintenanceDialog
        asset={asset ?? null}
        open={maintenanceDialogOpen}
        onOpenChange={setMaintenanceDialogOpen}
      />
      <UpdateAssetValuationDialog
        asset={asset ?? null}
        open={valuationDialogOpen}
        onOpenChange={setValuationDialogOpen}
      />
    </div>
  );
};
