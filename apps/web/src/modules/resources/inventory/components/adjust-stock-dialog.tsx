import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
  Alert,
  AlertDescription,
  AlertTitle,
} from '@kinergy-platform/ui';
import { Scale, AlertCircle, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../../../../shared/forms';
import { adjustStockSchema, type AdjustStockFormData } from '../schemas';
import { useAdjustStock } from '../hooks';
import { inventoryQueryKeys } from '../api';
import type { InventoryProductVM } from '../types';

export interface AdjustStockDialogProps {
  readonly product: InventoryProductVM | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess?: () => void;
}

export const AdjustStockDialog: React.FC<AdjustStockDialogProps> = ({
  product,
  open,
  onOpenChange,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const { mutate: adjustStock, isPending } = useAdjustStock();
  const [direction, setDirection] = useState<'IN' | 'OUT'>('IN');
  const [serverErrorMessage, setServerErrorMessage] = useState<string | null>(null);

  const form = useForm<AdjustStockFormData>({
    resolver: zodResolver(adjustStockSchema),
    defaultValues: {
      deltaQuantity: 0,
      reason: '',
    },
  });

  const { handleSubmit, control, watch, setValue, reset } = form;
  const currentDelta = watch('deltaQuantity') || 0;
  const currentStock = product?.currentStock ?? 0;
  const projectedStock = currentStock + (Number.isFinite(currentDelta) ? currentDelta : 0);

  React.useEffect(() => {
    if (open) {
      setServerErrorMessage(null);
      setDirection('IN');
      reset({
        deltaQuantity: 0,
        reason: '',
      });
    }
  }, [open, reset]);

  const handleDirectionChange = (newDirection: 'IN' | 'OUT') => {
    setDirection(newDirection);
    const absVal = Math.abs(currentDelta);
    if (absVal > 0) {
      setValue('deltaQuantity', newDirection === 'IN' ? absVal : -absVal, {
        shouldValidate: true,
      });
    }
  };

  const onSubmit = (values: AdjustStockFormData) => {
    if (!product) return;
    setServerErrorMessage(null);

    adjustStock(
      {
        id: product.id,
        payload: {
          deltaQuantity: values.deltaQuantity,
          reason: values.reason.trim(),
        },
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          onSuccess?.();
        },
        onError: (err) => {
          const msg = err.message || 'Failed to record audit adjustment';
          setServerErrorMessage(msg);
          if (
            msg.toLowerCase().includes('insufficient stock') ||
            msg.toLowerCase().includes('conflict')
          ) {
            queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.detail(product.id) });
            queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.stock(product.id) });
          }
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="adjust-stock-dialog">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <Scale className="h-5 w-5" />
            <DialogTitle>Physical Stock Count Adjustment</DialogTitle>
          </div>
          <DialogDescription>
            Record an explicit audit discrepancy reconciliation for{' '}
            <span className="font-semibold text-foreground">{product?.name}</span> ({product?.sku}).
          </DialogDescription>
        </DialogHeader>

        {/* Direction Selector: Explicit In vs Out */}
        <div className="space-y-1.5 pt-1">
          <span className="text-xs font-semibold text-foreground block">Adjustment Direction</span>
          <div className="grid grid-cols-2 gap-2" data-testid="adjustment-direction-selector">
            <Button
              type="button"
              variant={direction === 'IN' ? 'default' : 'outline'}
              size="sm"
              className="gap-1.5 text-xs h-9 justify-center"
              onClick={() => handleDirectionChange('IN')}
              data-testid="direction-in-btn"
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
              Adjustment In (+)
            </Button>
            <Button
              type="button"
              variant={direction === 'OUT' ? 'default' : 'outline'}
              size="sm"
              className="gap-1.5 text-xs h-9 justify-center"
              onClick={() => handleDirectionChange('OUT')}
              data-testid="direction-out-btn"
            >
              <ArrowDownRight className="h-3.5 w-3.5" />
              Adjustment Out (-)
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {direction === 'IN'
              ? 'Record unrecorded or surplus stock found during physical count.'
              : 'Record discrepancy, shrinkage, or audit count loss.'}
          </p>
        </div>

        {/* Balance comparison box */}
        <div className="flex items-center justify-between p-3 rounded-md bg-muted/60 border text-xs">
          <div>
            <span className="text-muted-foreground block">Current Balance:</span>
            <span className="font-bold text-foreground font-mono text-sm">
              {currentStock} {product?.unitOfMeasure}
            </span>
          </div>
          <div className="text-right">
            <span className="text-muted-foreground block">Projected Balance:</span>
            <span
              className={`font-bold font-mono text-sm ${
                projectedStock < 0 ? 'text-destructive' : 'text-foreground'
              }`}
            >
              {projectedStock} {product?.unitOfMeasure}
            </span>
          </div>
        </div>

        {/* In-Modal Server Rejection Alert */}
        {serverErrorMessage && (
          <Alert variant="destructive" className="py-2.5" data-testid="adjust-stock-error-alert">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle className="text-xs font-semibold">Adjustment Aborted</AlertTitle>
            <AlertDescription className="text-xs mt-0.5">{serverErrorMessage}</AlertDescription>
          </Alert>
        )}

        {/* Negative stock client-side protection alert */}
        {projectedStock < 0 && (
          <Alert variant="destructive" className="py-2 text-xs">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle className="font-semibold text-xs">Negative Balance Prohibited</AlertTitle>
            <AlertDescription className="text-[11px]">
              Discrepancy exceeds available inventory ({currentStock} on hand). Balance cannot be
              negative.
            </AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-1" noValidate>
            <FormField
              control={control}
              name="deltaQuantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Delta Units (+ or -)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="1"
                      placeholder="e.g. -2 or +5"
                      {...field}
                      onChange={(e) => {
                        const raw = parseInt(e.target.value, 10);
                        if (Number.isNaN(raw)) {
                          field.onChange('');
                        } else {
                          // Automatically synchronize direction if operator enters explicit minus
                          if (raw < 0 && direction === 'IN') {
                            setDirection('OUT');
                          } else if (raw > 0 && direction === 'OUT') {
                            setDirection('IN');
                          }
                          field.onChange(raw);
                        }
                      }}
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Positive integer to increment stock on hand; negative integer to decrement.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Audit Reason</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Physical inventory cycle count adjustment"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Mandatory explanation for the stock discrepancy (min 5 characters).
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-3 gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending || projectedStock < 0} className="gap-1.5">
                <Scale className="h-4 w-4" />
                {isPending ? 'Adjusting...' : 'Record Adjustment'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
