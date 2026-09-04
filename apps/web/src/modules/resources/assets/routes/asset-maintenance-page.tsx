import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Button,
  Input,
  Badge,
  Skeleton,
  Alert,
  AlertTitle,
  AlertDescription,
} from '@kinergy-platform/ui';
import {
  ArrowLeft,
  Wrench,
  Calendar,
  DollarSign,
  UserCheck,
  Plus,
  Filter,
  RefreshCw,
  AlertCircle,
  FileText,
  Lock,
} from 'lucide-react';
import { useAsset, useAssetMaintenanceHistory } from '../hooks';
import { useAuth } from '../../../../app/providers/auth-provider';
import { AssetStatusBadge } from '../components/asset-status-badge';
import { AssetConditionBadge } from '../components/asset-condition-badge';
import { AssetCategoryBadge } from '../components/asset-category-badge';
import { RecordAssetMaintenanceDialog } from '../components/asset-maintenance-dialog';

export const AssetMaintenancePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { hasPermission, hasRole } = useAuth();

  const [isRecordDialogOpen, setIsRecordDialogOpen] = useState(false);
  const [performedByFilter, setPerformedByFilter] = useState('');
  const [page, setPage] = useState(1);
  const limit = 10;

  // Permissions
  const isSuperAdmin = Boolean(hasRole('ADMIN') || hasRole('SUPER_ADMIN') || hasRole('OWNER'));
  const canWriteAssets = Boolean(hasPermission('assets.write') || isSuperAdmin);
  const canViewFinancials = Boolean(
    hasPermission('billing.read') || hasPermission('valuation.read') || isSuperAdmin,
  );

  // Queries
  const {
    data: asset,
    isLoading: isAssetLoading,
    error: assetError,
    refetch: refetchAsset,
  } = useAsset(id);

  const {
    data: maintenanceData,
    isLoading: isMaintenanceLoading,
    error: maintenanceError,
    refetch: refetchMaintenance,
  } = useAssetMaintenanceHistory(id ?? '', {
    page,
    limit,
    performedBy: performedByFilter.trim() || undefined,
  });

  const records = maintenanceData?.items ?? [];
  const totalRecords = maintenanceData?.total ?? 0;
  const totalPages = maintenanceData?.totalPages ?? 1;

  return (
    <div className="space-y-6 max-w-7xl mx-auto" data-testid="asset-maintenance-page">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            to={`/resources/assets/${encodeURIComponent(id ?? '')}`}
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center"
          >
            <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to Asset Overview
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-foreground mt-1">
            Maintenance & Servicing Ledger: {asset?.name ? `${asset.name} (${id})` : id}
          </h1>
          {asset && (
            <div className="text-sm text-muted-foreground font-medium flex items-center gap-2 mt-0.5">
              <span>Tag:</span>
              <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded text-foreground">
                {asset.assetTag}
              </span>
              <span>•</span>
              <AssetCategoryBadge category={asset.category} />
              <AssetStatusBadge status={asset.status} />
              <AssetConditionBadge condition={asset.condition} />
            </div>
          )}
        </div>

        {canWriteAssets && (
          <Button
            onClick={() => setIsRecordDialogOpen(true)}
            size="sm"
            data-testid="open-record-maintenance-btn"
            disabled={!asset || isAssetLoading}
          >
            <Plus className="mr-1.5 h-4 w-4" /> Record Work Order
          </Button>
        )}
      </div>

      {isAssetLoading && (
        <div className="space-y-6" data-testid="asset-maintenance-page-loading">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {(assetError || (!asset && !isAssetLoading)) && (
        <div className="space-y-4">
          <Alert variant="destructive" data-testid="maintenance-page-error">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Asset Not Found</AlertTitle>
            <AlertDescription>
              Could not retrieve equipment data for ID &apos;{id}&apos;.
            </AlertDescription>
          </Alert>
          <Button onClick={() => refetchAsset()} variant="outline" size="sm">
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      )}

      {asset && (
        <>
          {/* Overview Metric Banner */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-4 bg-card/60 shadow-sm border-border">
              <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">
                Total Logged Work Orders
              </p>
              <div className="flex items-center gap-2 mt-1">
                <Wrench className="h-5 w-5 text-primary" />
                <span
                  className="text-2xl font-bold font-mono text-foreground"
                  data-testid="total-records-count"
                >
                  {totalRecords}
                </span>
              </div>
            </Card>

            <Card className="p-4 bg-card/60 shadow-sm border-border">
              <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">
                Current Physical Rating
              </p>
              <div className="flex items-center gap-2 mt-2">
                <AssetConditionBadge condition={asset.condition} />
              </div>
            </Card>

            <Card className="p-4 bg-card/60 shadow-sm border-border">
              <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">
                Operational Placement
              </p>
              <p className="font-mono font-medium text-sm text-foreground mt-2">
                {asset.location.facilityId}
                {asset.location.roomId && ` • ${asset.location.roomId}`}
              </p>
            </Card>
          </div>

          {/* Filter Toolbar */}
          <Card className="p-4 bg-card shadow-sm border-border">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 max-w-sm flex-1">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Filter by technician or vendor..."
                  value={performedByFilter}
                  onChange={(e) => {
                    setPerformedByFilter(e.target.value);
                    setPage(1);
                  }}
                  className="h-9 text-xs"
                  data-testid="filter-technician-input"
                />
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchMaintenance()}
                disabled={isMaintenanceLoading}
              >
                <RefreshCw
                  className={`mr-1.5 h-3.5 w-3.5 ${isMaintenanceLoading ? 'animate-spin' : ''}`}
                />
                Refresh Ledger
              </Button>
            </div>
          </Card>

          {/* Maintenance History Table / List */}
          <Card className="shadow-sm border-border overflow-hidden">
            <CardHeader className="p-4 border-b border-border bg-muted/20">
              <CardTitle className="text-base font-semibold text-foreground">
                Authoritative Servicing Ledger
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Chronological audit records of all physical repairs, vendor work orders, and parts
                replacements.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-0">
              {isMaintenanceLoading ? (
                <div className="p-6 space-y-4" data-testid="ledger-loading">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : maintenanceError ? (
                <div className="p-6 text-center space-y-3" data-testid="ledger-error">
                  <AlertCircle className="mx-auto h-8 w-8 text-destructive" />
                  <p className="text-sm font-semibold text-foreground">
                    Failed to load servicing ledger
                  </p>
                  <p className="text-xs text-muted-foreground">{maintenanceError.message}</p>
                  <Button onClick={() => refetchMaintenance()} variant="outline" size="sm">
                    Retry Query
                  </Button>
                </div>
              ) : records.length === 0 ? (
                <div className="p-12 text-center space-y-2" data-testid="ledger-empty">
                  <Wrench className="mx-auto h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm font-semibold text-foreground">
                    No servicing work orders logged
                  </p>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    {performedByFilter.trim()
                      ? `No maintenance records found matching technician '${performedByFilter}'.`
                      : 'This equipment has not received logged corrective repairs or preventative maintenance.'}
                  </p>
                  {canWriteAssets && !performedByFilter.trim() && (
                    <Button
                      onClick={() => setIsRecordDialogOpen(true)}
                      variant="outline"
                      size="sm"
                      className="mt-2"
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" /> Log First Maintenance Order
                    </Button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-border" data-testid="maintenance-records-list">
                  {records.map((rec) => {
                    const serviceDateFormatted = new Date(rec.serviceDate).toLocaleDateString(
                      'en-US',
                      {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      },
                    );

                    return (
                      <div
                        key={rec.id}
                        className="p-4 hover:bg-muted/30 transition-colors space-y-2"
                        data-testid={`maintenance-record-${rec.id}`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className="bg-primary/10 text-primary border-primary/20 text-[11px] font-medium"
                              >
                                Work Order
                              </Badge>
                              <span className="font-semibold text-sm text-foreground">
                                {rec.description}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5" /> {serviceDateFormatted}
                              </span>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <UserCheck className="h-3.5 w-3.5" /> {rec.performedBy}
                              </span>
                            </div>
                          </div>

                          {/* Invoiced Cost (Permission-Protected) */}
                          <div className="text-right">
                            {canViewFinancials ? (
                              <div className="flex items-center gap-1 font-mono font-semibold text-foreground text-sm">
                                <DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                <span>
                                  $
                                  {rec.cost.amount.toLocaleString('en-US', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </span>
                              </div>
                            ) : (
                              <Badge
                                variant="outline"
                                className="bg-muted text-muted-foreground text-[10px] gap-1"
                                data-testid="confidential-cost-badge"
                              >
                                <Lock className="h-3 w-3" /> Confidential
                              </Badge>
                            )}
                          </div>
                        </div>

                        {rec.notes && (
                          <div className="rounded bg-muted/40 p-2 text-xs text-muted-foreground flex items-start gap-1.5">
                            <FileText className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                            <span>{rec.notes}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div
                className="p-3 border-t border-border bg-muted/20 flex items-center justify-between text-xs text-muted-foreground"
                data-testid="maintenance-pagination"
              >
                <span>
                  Page <strong>{page}</strong> of <strong>{totalPages}</strong> ({totalRecords}{' '}
                  items)
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    data-testid="maintenance-prev-page-btn"
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    data-testid="maintenance-next-page-btn"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* Record Maintenance Modal Dialog */}
          <RecordAssetMaintenanceDialog
            asset={asset}
            open={isRecordDialogOpen}
            onOpenChange={setIsRecordDialogOpen}
            onSuccess={() => {
              refetchMaintenance();
              refetchAsset();
            }}
          />
        </>
      )}
    </div>
  );
};
