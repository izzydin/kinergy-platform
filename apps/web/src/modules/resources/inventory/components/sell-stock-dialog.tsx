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
import { ShoppingCart, AlertCircle } from 'lucide-react';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../../../../shared/forms';
import { sellStockSchema, type SellStockFormData } from '../schemas';
import { useSellStock } from '../hooks';
import { inventoryQueryKeys } from '../api';
import type { InventoryProductVM } from '../types';

export interface SellStockDialogProps {
  readonly product: InventoryProductVM | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess?: () => void;
}

export const SellStockDialog: React.FC<SellStockDialogProps> = ({
  product,
  open,
  onOpenChange,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const { mutate: sellStock, isPending } = useSellStock();
  const [serverErrorMessage, setServerErrorMessage] = useState<string | null>(null);

  const form = useForm<SellStockFormData>({
    resolver: zodResolver(sellStockSchema),
    defaultValues: {
      quantity: 1,
      unitPrice: product?.sellingPrice?.amount,
      referenceId: '',
      notes: '',
    },
  });

  const { handleSubmit, control, reset } = form;

  React.useEffect(() => {
    if (open && product) {
      setServerErrorMessage(null);
      reset({
        quantity: 1,
        unitPrice: product.sellingPrice.amount,
        referenceId: '',
        notes: '',
      });
    }
  }, [open, product, reset]);

  const onSubmit = (values: SellStockFormData) => {
    if (!product) return;
    setServerErrorMessage(null);

    sellStock(
      {
        id: product.id,
        payload: {
          quantity: values.quantity,
          unitPrice: values.unitPrice,
          referenceId: values.referenceId?.trim() || undefined,
          notes: values.notes?.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          onSuccess?.();
        },
        onError: (err) => {
          const msg = err.message || 'Failed to record retail sale';
          setServerErrorMessage(msg);
          // If insufficient stock or OCC race, immediately reconcile authoritative server state
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

  const currentStock = product?.currentStock ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="sell-stock-dialog">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <ShoppingCart className="h-5 w-5" />
            <DialogTitle>Record Retail Sale</DialogTitle>
          </div>
          <DialogDescription>
            Record point-of-sale customer order for{' '}
            <span className="font-semibold text-foreground">{product?.name}</span> ({product?.sku}).
          </DialogDescription>
        </DialogHeader>

        {/* Current Available Stock Notice */}
        <div className="flex items-center justify-between p-2.5 rounded-md bg-muted/60 border text-xs">
          <span className="text-muted-foreground">Available on hand:</span>
          <span className="font-mono font-bold text-foreground">
            {currentStock} {product?.unitOfMeasure}
          </span>
        </div>

        {/* In-Modal Server Rejection Alert */}
        {serverErrorMessage && (
          <Alert variant="destructive" className="py-2.5" data-testid="sell-stock-error-alert">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle className="text-xs font-semibold">Transaction Aborted</AlertTitle>
            <AlertDescription className="text-xs mt-0.5">{serverErrorMessage}</AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-1" noValidate>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Units Sold</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        placeholder="1"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value, 10) || '')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={control}
                name="unitPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Selling Price ($)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          field.onChange(val === '' ? undefined : Number(val));
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={control}
              name="referenceId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>POS Receipt / Member ID</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. REC-2026-9041 or Member #481" {...field} />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Optional cashier transaction or client billing reference.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sale Notes</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Optional notes (promotions, payment method, etc.)"
                      {...field}
                    />
                  </FormControl>
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
              <Button type="submit" disabled={isPending} className="gap-1.5">
                <ShoppingCart className="h-4 w-4" />
                {isPending ? 'Processing...' : 'Record Sale'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
