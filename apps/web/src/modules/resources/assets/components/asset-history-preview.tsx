import React from 'react';
import { Link } from 'react-router-dom';
import { Button, Skeleton } from '@kinergy-platform/ui';
import { History, ArrowRight } from 'lucide-react';
import { useAuth } from '../../../../app/providers/auth-provider';
import { useAssetHistory } from '../hooks';
import { AssetHistoryItem } from './asset-history-item';

export interface AssetHistoryPreviewProps {
  readonly assetId: string;
}

export const AssetHistoryPreview: React.FC<AssetHistoryPreviewProps> = ({ assetId }) => {
  const { hasPermission, hasRole } = useAuth();
  const canViewFinancials =
    hasPermission('billing.read') ||
    hasPermission('valuation.read') ||
    hasRole('ADMIN') ||
    hasRole('SUPER_ADMIN') ||
    hasRole('OWNER');

  const { data, isLoading } = useAssetHistory(assetId, { limit: 5 });

  const events = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="space-y-3 p-2" data-testid="history-preview-loading">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground space-y-2">
        <History className="mx-auto h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm font-medium">No lifecycle events recorded</p>
        <p className="text-xs">
          Events will appear here as the asset moves, is serviced, or transitions state.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="asset-history-preview">
      <div className="relative border-l-2 border-border/70 ml-3.5 space-y-4 pb-1">
        {events.map((event, idx) => (
          <AssetHistoryItem
            key={event.id}
            event={event}
            canViewFinancials={canViewFinancials}
            isLatest={idx === 0}
          />
        ))}
      </div>

      <div className="pt-2 flex justify-end">
        <Button variant="ghost" size="sm" asChild>
          <Link to={`/resources/assets/${encodeURIComponent(assetId)}/history`}>
            View Complete Audit History ({data?.total ?? events.length}){' '}
            <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
};
