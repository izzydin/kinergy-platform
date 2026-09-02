import React from 'react';
import { Button } from '@kinergy-platform/ui';
import { RotateCcw } from 'lucide-react';
import { StockMovementType } from '../types';

export interface MovementHistoryFilterBarProps {
  readonly movementType?: StockMovementType;
  readonly isFiltered: boolean;
  readonly onMovementTypeChange: (type?: StockMovementType) => void;
  readonly onResetFilters: () => void;
}

const FILTER_CHIPS: Array<{
  readonly label: string;
  readonly value?: StockMovementType;
}> = [
  { label: 'All Operations', value: undefined },
  { label: 'Purchases (+)', value: StockMovementType.PURCHASE },
  { label: 'Retail Sales (-)', value: StockMovementType.SALE },
  { label: 'Clinical Treatments (-)', value: StockMovementType.CONSUMPTION },
  { label: 'Adjustments In (+)', value: StockMovementType.ADJUSTMENT_IN },
  { label: 'Adjustments Out (-)', value: StockMovementType.ADJUSTMENT_OUT },
  { label: 'Disposals / Scrap (-)', value: StockMovementType.SCRAP },
];

export const MovementHistoryFilterBar: React.FC<MovementHistoryFilterBarProps> = ({
  movementType,
  isFiltered,
  onMovementTypeChange,
  onResetFilters,
}) => {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border bg-card/60"
      data-testid="movement-history-filter-bar"
    >
      {/* Quick Operation Type Filter Chips */}
      <div className="flex flex-wrap items-center gap-1.5" data-testid="movement-type-chips">
        {FILTER_CHIPS.map((chip) => {
          const isSelected = movementType === chip.value;
          return (
            <Button
              key={chip.label}
              type="button"
              variant={isSelected ? 'default' : 'outline'}
              size="sm"
              className={`h-7 px-2.5 text-xs transition-all ${
                isSelected ? 'font-semibold shadow-xs' : 'text-muted-foreground'
              }`}
              onClick={() => onMovementTypeChange(chip.value)}
              data-testid={`filter-chip-${chip.value || 'all'}`}
            >
              {chip.label}
            </Button>
          );
        })}
      </div>

      {/* Reset Filter Action */}
      {isFiltered && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onResetFilters}
          className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
          data-testid="reset-movement-filters-btn"
        >
          <RotateCcw className="h-3 w-3" />
          Reset Filter
        </Button>
      )}
    </div>
  );
};
