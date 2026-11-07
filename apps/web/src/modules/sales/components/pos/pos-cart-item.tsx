import React from 'react';
import { Button, Badge } from '@kinergy-platform/ui';
import { Plus, Minus, Trash2 } from 'lucide-react';
import type { PosCartItem } from './pos-types';
import { formatMoneyCents } from '../../utils/financial-math';

export interface PosCartItemRowProps {
  item: PosCartItem;
  currency: string;
  onUpdateQuantity: (id: string, newQuantity: number) => void;
  onRemoveItem: (id: string) => void;
  disabled?: boolean;
}

export const PosCartItemRow: React.FC<PosCartItemRowProps> = ({
  item,
  currency,
  onUpdateQuantity,
  onRemoveItem,
  disabled = false,
}) => {
  const lineTotalCents = item.unitPriceCents * item.quantity;
  const isAtMaxStock = item.maxStock !== undefined && item.quantity >= item.maxStock;

  return (
    <div
      className="p-3 rounded-lg border border-border bg-card/60 flex flex-col gap-2 transition-all hover:bg-muted/20"
      data-testid={`pos-cart-item-${item.sourceType}-${item.sourceId}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-foreground leading-tight">{item.name}</span>
            <Badge variant="outline" className="text-[10px] py-0 px-1 font-mono">
              {item.category.replace(/_/g, ' ')}
            </Badge>
          </div>
          {item.description && (
            <p className="text-[11px] text-muted-foreground">{item.description}</p>
          )}
          <p className="text-[11px] text-muted-foreground font-mono">
            {formatMoneyCents(item.unitPriceCents, currency)} each
          </p>
        </div>

        {/* Remove Button */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => onRemoveItem(item.id)}
          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0"
          aria-label={`Remove ${item.name} from cart`}
          data-testid={`pos-remove-cart-item-${item.sourceId}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Quantity & Line Total */}
      <div className="flex items-center justify-between pt-1 border-t border-border/40">
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || item.quantity <= 1}
            onClick={() => onUpdateQuantity(item.id, Math.max(1, item.quantity - 1))}
            className="h-6 w-6 p-0 text-xs"
            aria-label="Decrease quantity"
            data-testid={`pos-decrease-qty-${item.sourceId}`}
          >
            <Minus className="h-3 w-3" />
          </Button>
          <span
            className="text-xs font-mono font-bold w-6 text-center"
            data-testid={`pos-qty-display-${item.sourceId}`}
          >
            {item.quantity}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || isAtMaxStock}
            onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
            className="h-6 w-6 p-0 text-xs"
            aria-label="Increase quantity"
            data-testid={`pos-increase-qty-${item.sourceId}`}
          >
            <Plus className="h-3 w-3" />
          </Button>
          {isAtMaxStock && (
            <span className="text-[10px] text-amber-500 font-medium ml-1">Max stock</span>
          )}
        </div>

        <span
          className="text-xs font-mono font-bold text-foreground"
          data-testid={`pos-line-total-${item.id}`}
        >
          {formatMoneyCents(lineTotalCents, currency)}
        </span>
      </div>
    </div>
  );
};
