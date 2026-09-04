import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Badge,
  Skeleton,
  Alert,
  AlertTitle,
  AlertDescription,
} from '@kinergy-platform/ui';
import {
  ArrowLeft,
  ArrowUpDown,
  Filter,
  RefreshCw,
  AlertCircle,
  History,
  ShieldCheck,
  Info,
} from 'lucide-react';
import { AssetHistoryEventType } from '@kinergy-platform/core';
import { useAuth } from '../../../../app/providers/auth-provider';
import { useAsset, useAssetHistory } from '../hooks';
import {
  AssetStatusBadge,
  AssetConditionBadge,
  AssetCategoryBadge,
  AssetHistoryItem,
} from '../components';

export const AssetHistoryPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { hasPermission, hasRole } = useAuth();

  // Permission evaluation for financial figures
  const canViewFinancials =
    hasPermission('billing.read') ||
    hasPermission('valuation.read') ||
    hasRole('ADMIN') ||
    hasRole('SUPER_ADMIN') ||
    hasRole('OWNER');

  // Filter & Pagination state
  const [selectedEventType, setSelectedEventType] = useState<AssetHistoryEventType | undefined>(
    undefined,
  );
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [page, setPage] = useState<number>(1);
  const limit = 15;

  // Queries
  const {
    data: asset,
    isLoading: isAssetLoading,
    error: assetError,
    refetch: refetchAsset,
  } = useAsset(id);

  const {
    data: historyData,
    isLoading: isHistoryLoading,
    error: historyError,
    refetch: refetchHistory,
  } = useAssetHistory(id, {
    page,
    limit,
    eventType: selectedEventType,
    sortOrder,
  });

  const records = historyData?.items ?? [];
  const totalRecords = historyData?.total ?? 0;
  const totalPages = historyData?.totalPages ?? 1;

  const isInitialCommissioningOnly =
    totalRecords === 1 &&
    records[0]?.eventType === AssetHistoryEventType.CREATED &&
    !selectedEventType;

  return (
    <div className="space-y-6 max-w-7xl mx-auto" data-testid="asset-history-page">
      {/* 1. Top Header Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            to={`/resources/assets/${encodeURIComponent(id ?? '')}`}
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center"
          >
            <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to Asset Overview
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-foreground mt-1">
            Lifecycle Audit History: {asset?.name ? `${asset.name} (${id})` : id}
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
      </div>

      {/* Asset Loading / Error Handlers */}
      {isAssetLoading && (
        <div className="space-y-6" data-testid="history-page-asset-loading">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {(assetError || (!asset && !isAssetLoading)) && (
        <div className="space-y-4">
          <Alert variant="destructive" data-testid="history-page-error">
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
          {/* 2. Overview Metric Banner */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-4 bg-card/60 shadow-sm border-border">
              <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">
                Total Lifecycle Events
              </p>
              <div className="flex items-center gap-2 mt-1">
                <History className="h-5 w-5 text-primary" />
                <span
                  className="text-2xl font-bold font-mono text-foreground"
                  data-testid="total-events-count"
                >
                  {totalRecords}
                </span>
              </div>
            </Card>

            <Card className="p-4 bg-card/60 shadow-sm border-border">
              <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">
                Current Operational State
              </p>
              <div className="flex items-center gap-2 mt-2">
                <AssetStatusBadge status={asset.status} />
              </div>
            </Card>

            <Card className="p-4 bg-card/60 shadow-sm border-border">
              <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">
                Current Physical Condition
              </p>
              <div className="flex items-center gap-2 mt-2">
                <AssetConditionBadge condition={asset.condition} />
              </div>
            </Card>
          </div>

          {/* 3. Filter & Sort Toolbar */}
          <Card className="p-4 bg-card shadow-sm border-border">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <select
                    value={selectedEventType || 'ALL'}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedEventType(
                        val === 'ALL' ? undefined : (val as AssetHistoryEventType),
                      );
                      setPage(1);
                    }}
                    className="h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground"
                    data-testid="event-type-filter-select"
                    aria-label="Filter by Event Type"
                  >
                    <option value="ALL">All Event Types</option>
                    <option value={AssetHistoryEventType.CREATED}>Commissioned</option>
                    <option value={AssetHistoryEventType.TRANSFERRED}>Relocations</option>
                    <option value={AssetHistoryEventType.STATUS_CHANGED}>Status Transitions</option>
                    <option value={AssetHistoryEventType.CONDITION_CHANGED}>
                      Condition Ratings
                    </option>
                    <option value={AssetHistoryEventType.MAINTENANCE_RECORDED}>
                      Maintenance Servicing
                    </option>
                    <option value={AssetHistoryEventType.VALUE_UPDATED}>
                      Valuation Appraisals
                    </option>
                    <option value={AssetHistoryEventType.RETIRED}>Decommissioned / Retired</option>
                    <option value={AssetHistoryEventType.SOLD}>Liquidated / Sold</option>
                    <option value={AssetHistoryEventType.UPDATED}>Metadata Updates</option>
                  </select>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
                    setPage(1);
                  }}
                  className="h-9 text-xs"
                  data-testid="toggle-sort-order-btn"
                >
                  <ArrowUpDown className="mr-1.5 h-3.5 w-3.5" />
                  {sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}
                </Button>

                {selectedEventType && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedEventType(undefined);
                      setPage(1);
                    }}
                    className="h-9 text-xs text-muted-foreground hover:text-foreground"
                    data-testid="reset-filter-btn"
                  >
                    Reset Filter
                  </Button>
                )}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchHistory()}
                disabled={isHistoryLoading}
                className="h-9 text-xs"
                data-testid="refresh-history-btn"
              >
                <RefreshCw
                  className={`mr-1.5 h-3.5 w-3.5 ${isHistoryLoading ? 'animate-spin' : ''}`}
                />
                Refresh Ledger
              </Button>
            </div>
          </Card>

          {/* 4. Timeline Stream Card */}
          <Card className="shadow-sm border-border overflow-hidden">
            <CardHeader className="p-4 border-b border-border bg-muted/20">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    Immutable Domain Lifecycle Stream
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">
                    Chronological audit ledger of all domain events emitted across this asset&apos;s
                    lifecycle.
                  </CardDescription>
                </div>
                <Badge
                  variant="outline"
                  className="bg-background text-[11px] font-mono text-muted-foreground"
                >
                  {sortOrder === 'desc' ? 'Chronology: Descending' : 'Chronology: Ascending'}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-6">
              {isHistoryLoading ? (
                <div className="space-y-4 p-2" data-testid="history-loading">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : historyError ? (
                <div className="p-6 text-center space-y-3" data-testid="history-error">
                  <AlertCircle className="mx-auto h-8 w-8 text-destructive" />
                  <p className="text-sm font-semibold text-foreground">
                    Failed to load lifecycle audit history
                  </p>
                  <p className="text-xs text-muted-foreground">{historyError.message}</p>
                  <Button onClick={() => refetchHistory()} variant="outline" size="sm">
                    Retry Query
                  </Button>
                </div>
              ) : records.length === 0 ? (
                <div className="p-12 text-center space-y-2" data-testid="history-empty">
                  <History className="mx-auto h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm font-semibold text-foreground">
                    No lifecycle events recorded
                  </p>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    {selectedEventType
                      ? `No audit entries found matching the filter '${selectedEventType}'.`
                      : 'This equipment does not currently have recorded lifecycle audit entries.'}
                  </p>
                  {selectedEventType && (
                    <Button
                      onClick={() => setSelectedEventType(undefined)}
                      variant="outline"
                      size="sm"
                      className="mt-2"
                    >
                      Clear Event Filter
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Informative notice for brand-new equipment */}
                  {isInitialCommissioningOnly && (
                    <Alert
                      variant="default"
                      className="bg-primary/5 border-primary/20 text-foreground"
                      data-testid="initial-commissioning-notice"
                    >
                      <Info className="h-4 w-4 text-primary" />
                      <AlertTitle className="text-xs font-semibold text-primary">
                        Initial Baseline Record
                      </AlertTitle>
                      <AlertDescription className="text-xs text-muted-foreground">
                        This equipment currently has only its baseline commissioning entry.
                        Subsequent physical relocations, operational status changes, condition
                        re-ratings, or servicing events will appear here in chronological sequence.
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Vertical Timeline Stream */}
                  <div
                    className="relative border-l-2 border-border/70 ml-3.5 space-y-6 pb-2"
                    data-testid="history-timeline-stream"
                  >
                    {records.map((event, idx) => (
                      <AssetHistoryItem
                        key={event.id}
                        event={event}
                        canViewFinancials={canViewFinancials}
                        isLatest={idx === 0 && page === 1 && sortOrder === 'desc'}
                      />
                    ))}
                  </div>
                </div>
              )}
            </CardContent>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div
                className="p-3 border-t border-border bg-muted/20 flex items-center justify-between text-xs text-muted-foreground"
                data-testid="history-pagination"
              >
                <span>
                  Page <strong>{page}</strong> of <strong>{totalPages}</strong> ({totalRecords}{' '}
                  events)
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    data-testid="history-prev-page-btn"
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    data-testid="history-next-page-btn"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
};
