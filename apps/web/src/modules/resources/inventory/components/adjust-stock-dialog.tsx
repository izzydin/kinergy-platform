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
import { Scale } from 'lucide-react';
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
  const { mutate: adjustStock, isPending } = useAdjustStock();

  const form = useForm<AdjustStockFormData>({
    resolver: zodResolver(adjustStockSchema),
    defaultValues: {
      deltaQuantity: 0,
      reason: '',
    },
  });

  const { handleSubmit, control, watch, reset } = form;
  const currentDelta = watch('deltaQuantity') || 0;
  const currentStock = product?.currentStock ?? 0;
  const projectedStock = currentStock + (Number.isFinite(currentDelta) ? currentDelta : 0);

  React.useEffect(() => {
    if (open) {
      reset({
        deltaQuantity: 0,
        reason: '',
      });
    }
  }, [open, reset]);

  const onSubmit = (values: AdjustStockFormData) => {
    if (!product) return;

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
            Record an audit discrepancy reconciliation for{' '}
            <span className="font-semibold text-foreground">{product?.name}</span> ({product?.sku}).
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-1" noValidate>
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
                      onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Positive number to increment stock on hand; negative number to decrement.
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
