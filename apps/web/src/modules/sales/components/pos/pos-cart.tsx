import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Badge,
} from '@kinergy-platform/ui';
import { ShoppingCart, Trash2, Percent, Tag } from 'lucide-react';
import type { PosCartItem, PosDiscount } from './pos-types';
import { PosCartItemRow } from './pos-cart-item';
import { formatMoneyCents } from '../../utils/financial-math';

export interface PosCartProps {
  items: PosCartItem[];
  currency: string;
  orderDiscount?: PosDiscount;
  onUpdateQuantity: (id: string, newQuantity: number) => void;
  onRemoveItem: (id: string) => void;
  onClearCart: () => void;
  onSetOrderDiscount: (discount: PosDiscount | undefined) => void;
  disabled?: boolean;
}

export const PosCart: React.FC<PosCartProps> = ({
  items,
  currency,
  orderDiscount,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onSetOrderDiscount,
  disabled = false,
}) => {
  const [showDiscountInput, setShowDiscountInput] = useState(Boolean(orderDiscount));
  const [discountType, setDiscountType] = useState<'PERCENTAGE' | 'FIXED'>(
    orderDiscount?.type || 'PERCENTAGE',
  );
  const [discountValue, setDiscountValue] = useState<number>(orderDiscount?.value || 0);
  const [discountReason, setDiscountReason] = useState<string>(orderDiscount?.reason || '');

  // Integer cent arithmetic calculations
  const subtotalCents = items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);

  let discountCents = 0;
  if (orderDiscount && orderDiscount.value > 0) {
    if (orderDiscount.type === 'PERCENTAGE') {
      const pct = Math.min(100, Math.max(0, orderDiscount.value));
      discountCents = Math.round((subtotalCents * pct) / 100);
    } else {
      discountCents = Math.min(subtotalCents, Math.round(orderDiscount.value * 100));
    }
  }

  const netTotalCents = Math.max(0, subtotalCents - discountCents);

  const handleApplyDiscount = () => {
    if (discountValue <= 0) {
      onSetOrderDiscount(undefined);
      return;
    }
    onSetOrderDiscount({
      type: discountType,
      value: discountValue,
      reason: discountReason.trim() || undefined,
    });
  };

  const handleRemoveDiscount = () => {
    setShowDiscountInput(false);
    setDiscountValue(0);
    setDiscountReason('');
    onSetOrderDiscount(undefined);
  };

  return (
    <Card className="border-border bg-card shadow-sm" data-testid="pos-cart">
      <CardHeader className="p-4 pb-2 border-b border-border flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-primary" />
          <span>Current Transaction</span>
          <Badge variant="secondary" className="text-[11px] font-mono px-1.5 py-0">
            {items.reduce((acc, it) => acc + it.quantity, 0)} items
          </Badge>
        </CardTitle>

        {items.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClearCart}
            disabled={disabled}
            className="h-7 text-xs text-muted-foreground hover:text-destructive px-2"
            data-testid="pos-clear-cart-btn"
          >
            <Trash2 className="h-3 w-3 mr-1" /> Clear
          </Button>
        )}
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {/* Cart Items List */}
        {items.length === 0 ? (
          <div
            className="py-10 text-center space-y-2 border border-dashed border-border rounded-lg bg-muted/10"
            data-testid="pos-empty-cart"
          >
            <ShoppingCart className="h-7 w-7 text-muted-foreground/60 mx-auto" />
            <p className="text-xs font-semibold text-foreground">Cart is Empty</p>
            <p className="text-[11px] text-muted-foreground max-w-[200px] mx-auto">
              Select items from the catalog on the left to add them to this sale.
            </p>
          </div>
        ) : (
          <div
            className="space-y-2 max-h-[340px] overflow-y-auto pr-1"
            data-testid="pos-cart-items-list"
          >
            {items.map((item) => (
              <PosCartItemRow
                key={item.id}
                item={item}
                currency={currency}
                onUpdateQuantity={onUpdateQuantity}
                onRemoveItem={onRemoveItem}
                disabled={disabled}
              />
            ))}
          </div>
        )}

        {/* Order Discount Accordion / Panel */}
        {items.length > 0 && (
          <div className="pt-2 border-t border-border space-y-2">
            {!showDiscountInput ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => setShowDiscountInput(true)}
                className="h-7 text-xs text-primary gap-1 px-1.5"
                data-testid="pos-add-discount-btn"
              >
                <Percent className="h-3 w-3" /> Add Order Discount
              </Button>
            ) : (
              <div
                className="p-2.5 rounded-lg border border-border bg-muted/20 space-y-2 text-xs"
                data-testid="pos-discount-panel"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground text-[11px] flex items-center gap-1">
                    <Tag className="h-3 w-3 text-primary" /> Order-Level Discount
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveDiscount}
                    className="h-5 text-[11px] px-1 text-muted-foreground hover:text-destructive"
                  >
                    Remove
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-0.5">Type</label>
                    <select
                      value={discountType}
                      onChange={(e) => {
                        setDiscountType(e.target.value as 'PERCENTAGE' | 'FIXED');
                      }}
                      className="w-full h-7 text-xs rounded border border-input bg-background px-1.5"
                      data-testid="pos-discount-type-select"
                    >
                      <option value="PERCENTAGE">Percentage (%)</option>
                      <option value="FIXED">Fixed Amount ({currency})</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-0.5">
                      Value *
                    </label>
                    <Input
                      type="number"
                      step={discountType === 'PERCENTAGE' ? '1' : '0.01'}
                      min={0}
                      max={discountType === 'PERCENTAGE' ? 100 : undefined}
                      value={discountValue || ''}
                      onChange={(e) => setDiscountValue(Number(e.target.value))}
                      placeholder="0.00"
                      className="h-7 text-xs font-mono"
                      data-testid="pos-discount-value-input"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">
                    Reason / Override Note
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. Promotional campaign, Staff discount"
                    value={discountReason}
                    onChange={(e) => setDiscountReason(e.target.value)}
                    className="h-7 text-xs"
                    data-testid="pos-discount-reason-input"
                  />
                </div>

                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={handleApplyDiscount}
                  className="w-full h-7 text-xs"
                  data-testid="pos-apply-discount-btn"
                >
                  Apply Discount
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Financial Totals Breakdown */}
        {items.length > 0 && (
          <div className="pt-2 border-t border-border space-y-1.5 text-xs">
            <div className="flex justify-between py-0.5 text-muted-foreground">
              <span>Subtotal:</span>
              <span className="font-mono font-medium" data-testid="pos-subtotal">
                {formatMoneyCents(subtotalCents, currency)}
              </span>
            </div>

            {discountCents > 0 && (
              <div className="flex justify-between py-0.5 text-emerald-600 dark:text-emerald-400">
                <span>
                  Discount {orderDiscount?.type === 'PERCENTAGE' ? `(${orderDiscount.value}%)` : ''}
                  :
                </span>
                <span className="font-mono font-medium" data-testid="pos-discount">
                  - {formatMoneyCents(discountCents, currency)}
                </span>
              </div>
            )}

            <div className="flex justify-between py-1.5 border-t border-border text-base font-bold text-foreground">
              <span>Net Total Due:</span>
              <span className="font-mono text-primary" data-testid="pos-net-total">
                {formatMoneyCents(netTotalCents, currency)}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
