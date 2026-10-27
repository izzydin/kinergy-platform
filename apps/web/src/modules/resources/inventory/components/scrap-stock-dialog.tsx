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
import { Trash2, AlertCircle, AlertTriangle } from 'lucide-react';
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
import { scrapStockSchema, type ScrapStockFormData } from '../schemas';
import { useScrapStock } from '../hooks';
import { inventoryQueryKeys } from '../api';
import { formatStockOperationError } from '../utils';
import type { InventoryProductVM, StockMutationResultVM } from '../types';

export interface ScrapStockDialogProps {
  readonly product: InventoryProductVM | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess?: (result?: StockMutationResultVM) => void;
}

export const ScrapStockDialog: React.FC<ScrapStockDialogProps> = ({
  product,
  open,
  onOpenChange,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const { mutate: scrapStock, isPending } = useScrapStock();
  const [serverErrorMessage, setServerErrorMessage] = useState<string | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  const form = useForm<ScrapStockFormData>({
    resolver: zodResolver(scrapStockSchema),
    defaultValues: {
      quantity: 1,
      reason: '',
    },
  });

  const {
    handleSubmit,
    control,
    watch,
    reset,
    setFocus,
    formState: { isDirty, isSubmitSuccessful, errors, isSubmitted },
  } = form;

  const watchedQuantity = watch('quantity');
  const currentStock = product?.currentStock ?? 0;
  const numQuantity = Number.isFinite(watchedQuantity) ? Number(watchedQuantity) : 0;
  const isOverdraft = numQuantity > currentStock;
  const projectedStock = Number(Math.max(0, currentStock - numQuantity).toFixed(2));

  const { guardedOnOpenChange, isConfirmOpen, confirmDiscard, cancelDiscard } = useDirtyDialogGuard(
    {
      isDirty,
      isSubmitSuccessful,
      onClose: () => onOpenChange(false),
    },
  );

  React.useEffect(() => {
    if (open && product) {
      setServerErrorMessage(null);
      reset({
        quantity: 1,
        reason: '',
      });
    }
  }, [open, product, reset]);

  const onSubmit = (values: ScrapStockFormData) => {
    if (!product || isPending) return;
    setServerErrorMessage(null);

    scrapStock(
      {
        id: product.id,
        payload: {
          quantity: values.quantity,
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
          const msg = formatStockOperationError(err, 'Failed to record inventory disposal');
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
          data-testid="scrap-stock-dialog"
          onOpenAutoFocus={(e) => {
            // Safe by default: place initial focus on Cancel button
            e.preventDefault();
            cancelButtonRef.current?.focus();
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
            <div className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              <DialogTitle>Disposal / Scrap Stock</DialogTitle>
            </div>
            <DialogDescription>
              Record physical disposal of damaged or expired consumable inventory for{' '}
              <span className="font-semibold text-foreground">{product?.name}</span> ({product?.sku}
              ).
            </DialogDescription>
          </DialogHeader>

          {/* Balance and Write-Off Impact Summary */}
          <div
            className="flex items-center justify-between p-2.5 rounded-md bg-muted/60 border text-xs"
            data-testid="scrap-stock-balance-summary"
          >
            <div>
              <span className="text-muted-foreground block">Available on hand:</span>
              <span className="font-mono font-bold text-foreground">
                {currentStock} {product?.unitOfMeasure}
              </span>
            </div>
            <div className="text-right">
              <span className="text-muted-foreground block">Projected Balance:</span>
              <span
                className={`font-mono font-bold ${
                  isOverdraft ? 'text-destructive' : 'text-foreground'
                }`}
              >
                {projectedStock} {product?.unitOfMeasure}
              </span>
            </div>
          </div>

          {/* Overdraft client-side protection alert */}
          {isOverdraft && (
            <Alert
              variant="destructive"
              className="py-2 text-xs"
              data-testid="scrap-overdraft-alert"
            >
              <AlertCircle className="h-4 w-4" />
              <AlertTitle className="font-semibold text-xs">Exceeds Available Inventory</AlertTitle>
              <AlertDescription className="text-[11px]">
                Disposal quantity ({numQuantity}) exceeds available stock ({currentStock}{' '}
                {product?.unitOfMeasure}). You cannot write off more units than exist on hand.
              </AlertDescription>
            </Alert>
          )}

          {/* Irreversible Write-Off Ledger Alert */}
          <Alert className="bg-amber-50/70 border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300 py-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertTitle className="text-xs font-semibold">
              Irreversible Inventory Write-Off
            </AlertTitle>
            <AlertDescription className="text-xs mt-1">
              Disposed units are permanently written off from stock and committed to the immutable
              audit ledger. This action cannot be undone.
            </AlertDescription>
          </Alert>

          {/* In-Modal Server Rejection Alert */}
          {serverErrorMessage && (
            <Alert variant="destructive" className="py-2.5" data-testid="scrap-stock-error-alert">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle className="text-xs font-semibold">Disposal Rejected</AlertTitle>
              <AlertDescription className="text-xs mt-0.5">{serverErrorMessage}</AlertDescription>
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
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Units Disposed</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0.01"
                        step="any"
                        placeholder="1"
                        data-testid="scrap-stock-quantity-input"
                        {...field}
                        onChange={(e) => {
                          const val = e.target.value;
                          field.onChange(val === '' ? '' : Number(val));
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Disposal Reason</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. Broken seal during shipment or expired on batch audit"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription className="text-xs">
                      Mandatory explanation for write-off and double-entry ledger audit (min 5
                      characters).
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter className="pt-3 gap-2 sm:gap-0">
                <Button
                  ref={cancelButtonRef}
                  type="button"
                  variant="outline"
                  onClick={() => guardedOnOpenChange(false)}
                  disabled={isPending}
                  data-testid="scrap-cancel-btn"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={isPending || numQuantity <= 0 || isOverdraft}
                  className="gap-1.5"
                  data-testid="scrap-confirm-btn"
                >
                  <Trash2 className="h-4 w-4" />
                  {isPending ? 'Scrapping...' : 'Record Disposal'}
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
