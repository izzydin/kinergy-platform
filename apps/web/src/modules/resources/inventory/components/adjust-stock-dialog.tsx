import React, { useState, useRef } from 'react';
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
  FormValidationSummary,
  ConfirmDiscardDialog,
  useDirtyDialogGuard,
} from '../../../../shared/forms';
import { adjustStockSchema, type AdjustStockFormData } from '../schemas';
import { useAdjustStock } from '../hooks';
import { inventoryQueryKeys } from '../api';
import { formatStockOperationError } from '../utils';
import type { InventoryProductVM, StockMutationResultVM } from '../types';

export interface AdjustStockDialogProps {
  readonly product: InventoryProductVM | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess?: (result?: StockMutationResultVM) => void;
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
  const initialInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<AdjustStockFormData>({
    resolver: zodResolver(adjustStockSchema),
    defaultValues: {
      deltaQuantity: 0,
      reason: '',
    },
  });

  const {
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    setFocus,
    formState: { isDirty, isSubmitSuccessful, errors, isSubmitted },
  } = form;

  const { guardedOnOpenChange, isConfirmOpen, confirmDiscard, cancelDiscard } = useDirtyDialogGuard(
    {
      isDirty,
      isSubmitSuccessful,
      onClose: () => onOpenChange(false),
    },
  );

  const currentDelta = watch('deltaQuantity') || 0;
  const currentStock = product?.currentStock ?? 0;
  const numDelta = Number.isFinite(currentDelta) ? Number(currentDelta) : 0;
  const projectedStock = Number((currentStock + numDelta).toFixed(2));

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
    if (!product || isPending) return;
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
        onSuccess: (result) => {
          reset();
          onOpenChange(false);
          onSuccess?.(result);
        },
        onError: (err) => {
          const msg = formatStockOperationError(err, 'Failed to record audit adjustment');
          setServerErrorMessage(msg);
          if (
            err.message?.toLowerCase().includes('insufficient') ||
            err.message?.toLowerCase().includes('conflict')
          ) {
            queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.detail(product.id) });
            queryClient.invalidateQueries({ queryKey: inventoryQueryKeys.stock(product.id) });
          }
        },
      },
    );
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (isPending) return;
    guardedOnOpenChange(nextOpen);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="max-w-md"
          data-testid="adjust-stock-dialog"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            initialInputRef.current?.focus();
          }}
          onPointerDownOutside={(e) => {
            if (isPending) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (isPending) e.preventDefault();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              if (isPending) {
                e.preventDefault();
                return;
              }
              handleOpenChange(false);
            }
          }}
        >
          <DialogHeader>
            <div className="flex items-center gap-2 text-primary">
              <Scale className="h-5 w-5" />
              <DialogTitle>Physical Stock Count Adjustment</DialogTitle>
            </div>
            <DialogDescription>
              Record an explicit audit discrepancy reconciliation for{' '}
              <span className="font-semibold text-foreground">{product?.name}</span> ({product?.sku}
              ).
            </DialogDescription>
          </DialogHeader>

          {/* Direction Selector: Explicit In vs Out */}
          <div className="space-y-1.5 pt-1">
            <span
              id="adjustment-direction-label"
              className="text-xs font-semibold text-foreground block"
            >
              Adjustment Direction
            </span>
            <div
              className="grid grid-cols-2 gap-2"
              data-testid="adjustment-direction-selector"
              role="group"
              aria-labelledby="adjustment-direction-label"
            >
              <Button
                type="button"
                variant={direction === 'IN' ? 'default' : 'outline'}
                size="sm"
                className="gap-1.5 text-xs h-9 justify-center"
                onClick={() => handleDirectionChange('IN')}
                data-testid="direction-in-btn"
                aria-pressed={direction === 'IN'}
              >
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                Adjustment In (+)
              </Button>
              <Button
                type="button"
                variant={direction === 'OUT' ? 'default' : 'outline'}
                size="sm"
                className="gap-1.5 text-xs h-9 justify-center"
                onClick={() => handleDirectionChange('OUT')}
                data-testid="direction-out-btn"
                aria-pressed={direction === 'OUT'}
              >
                <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />
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
              <FormValidationSummary
                errors={errors}
                isSubmitted={isSubmitted}
                setFocus={setFocus}
              />
              <FormField
                control={control}
                name="deltaQuantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Delta Units (+ or -)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="any"
                        placeholder="e.g. -2 or +5"
                        data-testid="adjust-stock-delta-input"
                        {...field}
                        ref={(el) => {
                          field.ref(el);
                          (
                            initialInputRef as React.MutableRefObject<HTMLInputElement | null>
                          ).current = el;
                        }}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '' || val === '-') {
                            field.onChange('');
                            if (val === '-') setDirection('OUT');
                          } else {
                            const raw = Number(val);
                            if (!Number.isNaN(raw)) {
                              // Automatically synchronize direction if operator enters explicit minus
                              if (raw < 0 && direction === 'IN') {
                                setDirection('OUT');
                              } else if (raw > 0 && direction === 'OUT') {
                                setDirection('IN');
                              }
                              field.onChange(raw);
                            }
                          }
                        }}
                      />
                    </FormControl>
                    <FormDescription className="text-xs">
                      Enter the positive or negative count variance (delta), not the final balance.
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
                  onClick={() => guardedOnOpenChange(false)}
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isPending || projectedStock < 0 || numDelta === 0}
                  className="gap-1.5"
                  data-testid="adjust-stock-submit-btn"
                >
                  <Scale className="h-4 w-4" />
                  {isPending ? 'Adjusting...' : 'Record Adjustment'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <ConfirmDiscardDialog
        open={isConfirmOpen}
        onConfirm={confirmDiscard}
        onCancel={cancelDiscard}
      />
    </>
  );
};
