import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
} from '@kinergy-platform/ui';
import { PackagePlus } from 'lucide-react';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../../../../shared/forms';
import { receiveStockSchema, type ReceiveStockFormData } from '../schemas';
import { useReceiveStock } from '../hooks';
import type { InventoryProductVM } from '../types';

export interface ReceiveStockDialogProps {
  readonly product: InventoryProductVM | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess?: () => void;
}

export const ReceiveStockDialog: React.FC<ReceiveStockDialogProps> = ({
  product,
  open,
  onOpenChange,
  onSuccess,
}) => {
  const { mutate: receiveStock, isPending } = useReceiveStock();

  const form = useForm<ReceiveStockFormData>({
    resolver: zodResolver(receiveStockSchema),
    defaultValues: {
      quantity: 1,
      unitCost: product?.unitCost?.amount,
      referenceNumber: '',
      notes: '',
    },
  });

  const { handleSubmit, control, reset } = form;

  React.useEffect(() => {
    if (open && product) {
      reset({
        quantity: 1,
        unitCost: product.unitCost.amount,
        referenceNumber: '',
        notes: '',
      });
    }
  }, [open, product, reset]);

  const onSubmit = (values: ReceiveStockFormData) => {
    if (!product) return;

    receiveStock(
      {
        id: product.id,
        payload: {
          quantity: values.quantity,
          unitCost: values.unitCost,
          referenceNumber: values.referenceNumber.trim(),
          notes: values.notes?.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          onSuccess?.();
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="receive-stock-dialog">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <PackagePlus className="h-5 w-5" />
            <DialogTitle>Receive Inventory Batch</DialogTitle>
          </div>
          <DialogDescription>
            Record inbound supply receipt for{' '}
            <span className="font-semibold text-foreground">{product?.name}</span> ({product?.sku}).
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-1" noValidate>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Quantity Received</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        placeholder="10"
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
                name="unitCost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Batch Unit Cost ($)</FormLabel>
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
              name="referenceNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>PO / Invoice Reference</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. PO-2026-0891" {...field} />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Supplier delivery reference or purchase order tracking code.
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
                  <FormLabel>Delivery Notes</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Optional delivery condition, carrier, or bay info"
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
                <PackagePlus className="h-4 w-4" />
                {isPending ? 'Recording...' : 'Record Receipt'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
