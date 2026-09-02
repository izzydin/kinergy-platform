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
import { Stethoscope, AlertCircle } from 'lucide-react';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../../../../shared/forms';
import { consumeStockSchema, type ConsumeStockFormData } from '../schemas';
import { useConsumeStock } from '../hooks';
import { inventoryQueryKeys } from '../api';
import type { InventoryProductVM } from '../types';

export interface ConsumeStockDialogProps {
  readonly product: InventoryProductVM | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess?: () => void;
}

export const ConsumeStockDialog: React.FC<ConsumeStockDialogProps> = ({
  product,
  open,
  onOpenChange,
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const { mutate: consumeStock, isPending } = useConsumeStock();
  const [serverErrorMessage, setServerErrorMessage] = useState<string | null>(null);

  const form = useForm<ConsumeStockFormData>({
    resolver: zodResolver(consumeStockSchema),
    defaultValues: {
      quantity: 1,
      treatmentSessionId: '',
      notes: '',
    },
  });

  const { handleSubmit, control, reset } = form;

  React.useEffect(() => {
    if (open && product) {
      setServerErrorMessage(null);
      reset({
        quantity: 1,
        treatmentSessionId: '',
        notes: '',
      });
    }
  }, [open, product, reset]);

  const onSubmit = (values: ConsumeStockFormData) => {
    if (!product) return;
    setServerErrorMessage(null);

    consumeStock(
      {
        id: product.id,
        payload: {
          quantity: values.quantity,
          treatmentSessionId: values.treatmentSessionId?.trim() || undefined,
          notes: values.notes?.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          onSuccess?.();
        },
        onError: (err) => {
          const msg = err.message || 'Failed to record clinical consumption';
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
      <DialogContent className="max-w-md" data-testid="consume-stock-dialog">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <Stethoscope className="h-5 w-5" />
            <DialogTitle>Record Clinical Consumption</DialogTitle>
          </div>
          <DialogDescription>
            Record treatment or therapy consumption for{' '}
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
          <Alert variant="destructive" className="py-2.5" data-testid="consume-stock-error-alert">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle className="text-xs font-semibold">Transaction Aborted</AlertTitle>
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
                  <FormLabel required>Units Consumed</FormLabel>
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
              name="treatmentSessionId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Treatment / Appointment ID</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. APT-2026-0819 or SOAP note ID" {...field} />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Clinical appointment or patient session cross-reference.
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
                  <FormLabel>Clinical Notes</FormLabel>
                  <FormControl>
                    <Input placeholder="Optional patient protocol or application area" {...field} />
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
                <Stethoscope className="h-4 w-4" />
                {isPending ? 'Recording...' : 'Record Consumption'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
