import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, Skeleton, Button } from '@kinergy-platform/ui';
import { History, ArrowRight } from 'lucide-react';
import { useStockMovements } from '../hooks';
import { MovementTypeBadge } from './movement-type-badge';

export interface ProductMovementsPreviewProps {
  readonly productId: string;
  readonly unitOfMeasure: string;
  readonly onViewAll?: () => void;
}

export const ProductMovementsPreview: React.FC<ProductMovementsPreviewProps> = ({
  productId,
  unitOfMeasure,
  onViewAll,
}) => {
  const { data, isLoading, isError, refetch } = useStockMovements(productId, {
    page: 1,
    limit: 5,
  });

  const movements = data?.items ?? [];
  const totalMovements = data?.total ?? 0;

  return (
    <Card className="border-border bg-card" data-testid="product-movements-preview">
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          <div>
            <CardTitle className="text-base font-semibold text-foreground">
              Recent Movement Ledger
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Last {Math.min(movements.length, 5)} transactions of {totalMovements} recorded
              entries.
            </p>
          </div>
        </div>

        {totalMovements > 5 && onViewAll && (
          <Button variant="ghost" size="sm" onClick={onViewAll} className="text-xs gap-1 h-8">
            View Full Ledger ({totalMovements})
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </CardHeader>

      <CardContent>
        {isLoading && (
          <div className="space-y-3 py-2" data-testid="movements-preview-loading">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {isError && (
          <div className="p-4 text-center rounded-md bg-destructive/5 text-xs text-destructive space-y-2">
            <p>Failed to load recent ledger movements.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="h-7 text-xs">
              Retry
            </Button>
          </div>
        )}

        {!isLoading && !isError && movements.length === 0 && (
          <div
            className="py-8 text-center rounded-md border border-dashed border-border/80 bg-muted/20"
            data-testid="movements-preview-empty"
          >
            <p className="text-sm text-muted-foreground">
              No stock movements recorded yet for this product.
            </p>
            <p className="text-xs text-muted-foreground/70 mt-0.5">
              Inbound receipts and sales will populate this ledger chronologically.
            </p>
          </div>
        )}

        {!isLoading && !isError && movements.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-2 px-3 font-medium">Type</th>
                  <th className="py-2 px-3 font-medium">Delta</th>
                  <th className="py-2 px-3 font-medium">Balance Progression</th>
                  <th className="py-2 px-3 font-medium">Reference / Note</th>
                  <th className="py-2 px-3 font-medium text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {movements.map((movement) => {
                  const isPositive =
                    movement.newBalance > movement.previousBalance ||
                    movement.type.includes('PURCHASE') ||
                    movement.type.includes('IN');

                  return (
                    <tr
                      key={movement.id}
                      className="hover:bg-muted/40 transition-colors font-mono"
                      data-testid={`movement-row-${movement.id}`}
                    >
                      <td className="py-2.5 px-3 font-sans">
                        <MovementTypeBadge type={movement.type} />
                      </td>
                      <td className="py-2.5 px-3 font-bold">
                        <span
                          className={
                            isPositive
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }
                        >
                          {isPositive ? `+${movement.quantity}` : `-${movement.quantity}`}
                        </span>{' '}
                        <span className="text-[10px] font-normal text-muted-foreground font-sans">
                          {unitOfMeasure}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground">
                        {movement.previousBalance} →{' '}
                        <span className="font-semibold text-foreground">{movement.newBalance}</span>
                      </td>
                      <td className="py-2.5 px-3 font-sans text-muted-foreground max-w-[200px] truncate">
                        {movement.referenceNumber ? (
                          <span className="font-medium text-foreground">
                            {movement.referenceNumber}
                          </span>
                        ) : null}
                        {movement.referenceNumber && movement.reason ? ' — ' : null}
                        {movement.reason || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right text-muted-foreground">
                        {new Date(movement.occurredAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
