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
import { Trash2, AlertCircle } from 'lucide-react';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../../../../shared/forms';
import { scrapStockSchema, type ScrapStockFormData } from '../schemas';
import { useScrapStock } from '../hooks';
import { inventoryQueryKeys } from '../api';
import type { InventoryProductVM } from '../types';

export interface ScrapStockDialogProps {
  readonly product: InventoryProductVM | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess?: () => void;
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

  const form = useForm<ScrapStockFormData>({
    resolver: zodResolver(scrapStockSchema),
    defaultValues: {
      quantity: 1,
      reason: '',
    },
  });

  const { handleSubmit, control, reset } = form;

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
    if (!product) return;
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
        onSuccess: () => {
          onOpenChange(false);
          onSuccess?.();
        },
        onError: (err) => {
          const msg = err.message || 'Failed to record inventory disposal';
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

  const currentStock = product?.currentStock ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="scrap-stock-dialog">
        <DialogHeader>
          <div className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />
            <DialogTitle>Disposal / Scrap Stock</DialogTitle>
          </div>
          <DialogDescription>
            Record disposal of damaged or expired consumable inventory for{' '}
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
          <Alert variant="destructive" className="py-2.5" data-testid="scrap-stock-error-alert">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle className="text-xs font-semibold">Disposal Rejected</AlertTitle>
            <AlertDescription className="text-xs mt-0.5">{serverErrorMessage}</AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-1" noValidate>
            <FormField
              control={control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Units Disposed</FormLabel>
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
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={isPending} className="gap-1.5">
                <Trash2 className="h-4 w-4" />
                {isPending ? 'Scrapping...' : 'Record Disposal'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
