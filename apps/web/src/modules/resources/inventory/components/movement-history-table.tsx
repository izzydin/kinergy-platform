import React from 'react';
import { Button, Badge, Skeleton, Alert, AlertDescription, AlertTitle } from '@kinergy-platform/ui';
import {
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
  FilterX,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  User,
  RotateCcw,
} from 'lucide-react';
import { MovementTypeBadge } from './movement-type-badge';
import { StockMovementType, type StockMovementVM } from '../types';

export interface MovementHistoryTableProps {
  readonly movements: StockMovementVM[];
  readonly unitOfMeasure: string;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly errorMessage?: string;
  readonly page: number;
  readonly totalPages: number;
  readonly totalCount: number;
  readonly onPageChange: (page: number) => void;
  readonly onRetry?: () => void;
  readonly isFiltered: boolean;
  readonly onClearFilters?: () => void;
}

export const MovementHistoryTable: React.FC<MovementHistoryTableProps> = ({
  movements,
  unitOfMeasure,
  isLoading,
  isError,
  errorMessage,
  page,
  totalPages,
  totalCount,
  onPageChange,
  onRetry,
  isFiltered,
  onClearFilters,
}) => {
  // 1. Loading Skeleton State
  if (isLoading) {
    return (
      <div className="space-y-3 py-4" data-testid="movements-loading">
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    );
  }

  // 2. Error State
  if (isError) {
    return (
      <div className="py-6" data-testid="movements-error">
        <Alert variant="destructive" className="flex flex-col items-start gap-2 p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            <AlertTitle className="text-sm font-semibold">
              Failed to load movement ledger
            </AlertTitle>
          </div>
          <AlertDescription className="text-xs text-destructive-foreground/90">
            {errorMessage ||
              'Unable to retrieve the chronological stock movement records for this product.'}
          </AlertDescription>
          {onRetry && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="mt-2 text-xs gap-1.5 h-8 border-destructive/40 hover:bg-destructive/10"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Retry Query
            </Button>
          )}
        </Alert>
      </div>
    );
  }

  // 3. Filtered Empty State
  if (movements.length === 0 && isFiltered) {
    return (
      <div
        className="rounded-lg border border-dashed p-10 text-center bg-card/50 my-4"
        data-testid="movements-filtered-empty"
      >
        <FilterX className="mx-auto h-10 w-10 text-muted-foreground opacity-60 mb-3" />
        <h3 className="text-base font-semibold text-foreground">No matching movements found</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
          No transactions match the selected movement type filter. Clear your filter to view all
          chronological entries.
        </p>
        {onClearFilters && (
          <Button
            variant="outline"
            size="sm"
            onClick={onClearFilters}
            className="mt-4 text-xs gap-1.5 h-8"
          >
            Clear Movement Filters
          </Button>
        )}
      </div>
    );
  }

  // 4. Initial Empty State (No movements exist)
  if (movements.length === 0) {
    return (
      <div
        className="rounded-lg border border-dashed p-10 text-center bg-card/50 my-4"
        data-testid="movements-empty"
      >
        <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground opacity-50 mb-3" />
        <h3 className="text-base font-semibold text-foreground">No Movement Ledger Records</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
          No inventory operations have been recorded for this product yet. Inbound purchases, retail
          sales, treatment consumptions, or physical adjustments will appear here.
        </p>
      </div>
    );
  }

  // 5. Authoritative Movement Ledger Table
  return (
    <div className="space-y-4" data-testid="movements-table-container">
      <div className="rounded-lg border bg-card overflow-x-auto shadow-sm">
        <table className="w-full text-xs text-left">
          <thead className="bg-muted/50 border-b text-muted-foreground uppercase text-[10px] tracking-wider">
            <tr>
              <th className="py-3 px-4 font-semibold">Timestamp</th>
              <th className="py-3 px-4 font-semibold">Operation & Type</th>
              <th className="py-3 px-4 font-semibold text-right">Quantity Delta</th>
              <th className="py-3 px-4 font-semibold text-center">Balance Progression</th>
              <th className="py-3 px-4 font-semibold">Reference & Reason</th>
              <th className="py-3 px-4 font-semibold">Recorded By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {movements.map((movement) => {
              const isPositive =
                movement.type === StockMovementType.PURCHASE ||
                movement.type === StockMovementType.ADJUSTMENT_IN ||
                movement.newBalance > movement.previousBalance;

              const occurredDate = new Date(movement.occurredAt);
              const formattedDate = occurredDate.toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              });
              const formattedTime = occurredDate.toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              });

              return (
                <tr
                  key={movement.id}
                  className="hover:bg-muted/30 transition-colors font-sans"
                  data-testid={`movement-row-${movement.id}`}
                >
                  {/* Timestamp */}
                  <td className="py-3 px-4 whitespace-nowrap">
                    <div className="font-medium text-foreground">{formattedDate}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">
                      {formattedTime}
                    </div>
                  </td>

                  {/* Operation & Type */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <MovementTypeBadge type={movement.type} />
                    </div>
                  </td>

                  {/* Quantity Delta with Sign Representation */}
                  <td className="py-3 px-4 text-right whitespace-nowrap font-mono">
                    <div className="inline-flex items-center gap-1 font-bold">
                      {isPositive ? (
                        <>
                          <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span className="text-emerald-600 dark:text-emerald-400">
                            +{movement.quantity}
                          </span>
                        </>
                      ) : (
                        <>
                          <ArrowDownRight className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
                          <span className="text-rose-600 dark:text-rose-400">
                            -{movement.quantity}
                          </span>
                        </>
                      )}
                      <span className="text-[10px] text-muted-foreground font-normal ml-0.5">
                        {unitOfMeasure}
                      </span>
                    </div>
                  </td>

                  {/* Balance Progression */}
                  <td className="py-3 px-4 text-center whitespace-nowrap font-mono">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-muted/60 border text-[11px]">
                      <span className="text-muted-foreground">{movement.previousBalance}</span>
                      <span className="text-muted-foreground/60">→</span>
                      <span className="font-bold text-foreground">{movement.newBalance}</span>
                    </div>
                  </td>

                  {/* Reference & Reason */}
                  <td className="py-3 px-4 max-w-xs">
                    {movement.referenceNumber && (
                      <Badge variant="outline" className="font-mono text-[10px] mr-1.5 px-1.5 py-0">
                        {movement.referenceNumber}
                      </Badge>
                    )}
                    <span className="text-muted-foreground text-xs">
                      {movement.reason || 'Standard operational movement'}
                    </span>
                  </td>

                  {/* Performer / Actor */}
                  <td className="py-3 px-4 whitespace-nowrap">
                    <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
                      <User className="h-3 w-3 opacity-70" />
                      <span className="font-mono truncate max-w-[120px]" title={movement.actorId}>
                        {movement.actorId}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-1 py-2 text-xs text-muted-foreground">
        <div>
          Showing <span className="font-semibold text-foreground">{movements.length}</span> of{' '}
          <span className="font-semibold text-foreground">{totalCount}</span> total movement records
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-2" data-testid="movements-pagination">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="h-8 px-2.5 text-xs gap-1"
              data-testid="pagination-prev-btn"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous
            </Button>
            <span className="text-xs px-2 font-medium text-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="h-8 px-2.5 text-xs gap-1"
              data-testid="pagination-next-btn"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
