import React from 'react';
import { Link } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Skeleton,
} from '@kinergy-platform/ui';
import { AlertCircle, CheckCircle2, Wrench, ArrowRight, Eye } from 'lucide-react';
import { HasPermission } from '../../../../app/routes/permission-guard';
import { useAssetsList } from '../hooks';
import { AssetStatusBadge } from './asset-status-badge';
import { AssetConditionBadge } from './asset-condition-badge';
import { AssetCategoryBadge } from './asset-category-badge';
import { AssetStatus, type FixedAssetVM } from '../types';

export interface AssetAttentionQueueProps {
  onServiceAssetClick?: (asset: FixedAssetVM) => void;
}

export const AssetAttentionQueue: React.FC<AssetAttentionQueueProps> = ({
  onServiceAssetClick,
}) => {
  const {
    data: maintenanceData,
    isLoading: isMaintenanceLoading,
    isError: isMaintenanceError,
    refetch: refetchMaintenance,
  } = useAssetsList({ status: AssetStatus.UNDER_MAINTENANCE, limit: 10 });

  const {
    data: damagedData,
    isLoading: isDamagedLoading,
    isError: isDamagedError,
    refetch: refetchDamaged,
  } = useAssetsList({ status: AssetStatus.DAMAGED, limit: 10 });

  const isLoading = isMaintenanceLoading || isDamagedLoading;
  const isError = isMaintenanceError || isDamagedError;

  // Damaged equipment is prioritized above routine maintenance
  const damagedItems = damagedData?.items ?? [];
  const maintenanceItems = maintenanceData?.items ?? [];
  const attentionItems: FixedAssetVM[] = [...damagedItems, ...maintenanceItems];

  const totalAttentionCount = (damagedData?.total ?? 0) + (maintenanceData?.total ?? 0);

  return (
    <Card className="border-border bg-card" data-testid="asset-attention-queue">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <span>Maintenance & Damage Attention Queue</span>
            {totalAttentionCount > 0 && (
              <Badge variant="destructive" size="sm">
                {totalAttentionCount} Offline
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Physical capital assets requiring servicing, repairs, or return-to-service validation.
          </CardDescription>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/resources/assets?status=UNDER_MAINTENANCE">
            Filter in Catalog <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3" data-testid="attention-queue-loading">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : isError ? (
          <div
            className="flex flex-col items-center justify-center p-6 text-center space-y-3"
            data-testid="attention-queue-error"
          >
            <AlertCircle className="h-8 w-8 text-destructive" />
            <div className="space-y-1">
              <p className="font-semibold text-foreground">Failed to load attention queue</p>
              <p className="text-sm text-muted-foreground">
                An error occurred while fetching equipment maintenance and damage data.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                refetchMaintenance();
                refetchDamaged();
              }}
            >
              Try Again
            </Button>
          </div>
        ) : attentionItems.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center p-8 text-center space-y-3 bg-muted/20 rounded-lg border border-dashed border-border"
            data-testid="attention-queue-empty"
          >
            <CheckCircle2 className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
            <div className="space-y-1">
              <p className="font-semibold text-foreground">All Equipment Operational</p>
              <p className="text-sm text-muted-foreground">
                No physical assets are currently damaged or offline for servicing.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/resources/assets">Browse Full Catalog</Link>
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" data-testid="attention-queue-table">
              <thead className="border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground uppercase">
                <tr>
                  <th className="py-3 px-4">Asset Tag / Name</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Condition</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {attentionItems.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-medium text-foreground">
                        <Link
                          to={`/resources/assets/${item.id}`}
                          className="hover:underline text-primary"
                        >
                          {item.name}
                        </Link>
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">{item.assetTag}</div>
                    </td>
                    <td className="py-3 px-4">
                      <AssetCategoryBadge category={item.category} />
                    </td>
                    <td className="py-3 px-4 text-muted-foreground text-xs">
                      <div>Facility: {item.location.facilityId}</div>
                      {item.location.roomId && (
                        <div className="text-[11px] text-muted-foreground/80">
                          Room: {item.location.roomId}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <AssetStatusBadge status={item.status} />
                    </td>
                    <td className="py-3 px-4">
                      <AssetConditionBadge condition={item.condition} showRank />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-xs">
                          <Link to={`/resources/assets/${item.id}`}>
                            <Eye className="mr-1 h-3.5 w-3.5" /> Details
                          </Link>
                        </Button>
                        <HasPermission name="assets.write">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2 text-xs text-amber-700 dark:text-amber-300 border-amber-500/30 hover:bg-amber-500/10"
                            onClick={() => onServiceAssetClick?.(item)}
                            asChild={!onServiceAssetClick}
                          >
                            {onServiceAssetClick ? (
                              <>
                                <Wrench className="mr-1 h-3.5 w-3.5" /> Log Service
                              </>
                            ) : (
                              <Link to={`/resources/assets/${item.id}/maintenance`}>
                                <Wrench className="mr-1 h-3.5 w-3.5" /> Log Service
                              </Link>
                            )}
                          </Button>
                        </HasPermission>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
