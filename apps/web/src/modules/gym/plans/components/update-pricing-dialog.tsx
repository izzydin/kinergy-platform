import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from '@kinergy-platform/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { Info } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNotification } from '../../../../app/providers/notification-provider';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../../../../shared/forms';
import { usePlanMutations } from '../hooks/use-plans';
import { updatePricingSchema, UpdatePricingFormValues } from '../schemas/plan.schema';
import type { MembershipPlanVM } from '../types';

export interface UpdatePricingDialogProps {
  readonly plan: MembershipPlanVM | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export const UpdatePricingDialog: React.FC<UpdatePricingDialogProps> = ({
  plan,
  open,
  onOpenChange,
}) => {
  const { updatePricing } = usePlanMutations();
  const { success, error: notifyError } = useNotification();
  const [dollarPrice, setDollarPrice] = useState<string>('0.00');

  const form = useForm<UpdatePricingFormValues>({
    resolver: zodResolver(updatePricingSchema),
    defaultValues: {
      priceAmount: 0,
      currency: 'USD',
    },
    mode: 'onTouched',
  });

  useEffect(() => {
    if (plan && open) {
      const dollars = (plan.priceAmount / 100).toFixed(2);
      setDollarPrice(dollars);
      form.reset({
        priceAmount: plan.priceAmount,
        currency: plan.priceCurrency || 'USD',
      });
    }
  }, [plan, open, form]);

  const handleDollarChange = (val: string) => {
    setDollarPrice(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0) {
      form.setValue('priceAmount', Math.round(num * 100), { shouldValidate: true });
    }
  };

  const onSubmit = (values: UpdatePricingFormValues) => {
    if (!plan) return;

    updatePricing.mutate(
      {
        planId: plan.id,
        input: values,
      },
      {
        onSuccess: (updated) => {
          success(
            'Pricing Updated',
            `Plan "${updated.name}" updated to $${(updated.priceAmount / 100).toFixed(2)} ${updated.priceCurrency}.`,
          );
          onOpenChange(false);
        },
        onError: (err) => {
          notifyError(err, 'Failed to update plan pricing');
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="update-pricing-dialog">
        <DialogHeader>
          <DialogTitle>Update Plan Pricing</DialogTitle>
          <DialogDescription>
            Modify the commercial price for future sales of{' '}
            <span className="font-semibold text-foreground">{plan?.name}</span> ({plan?.code}).
          </DialogDescription>
        </DialogHeader>

        <Alert className="bg-blue-50/70 border-blue-200 text-blue-800 dark:bg-blue-950/20 dark:border-blue-800 dark:text-blue-300">
          <Info className="h-4 w-4" />
          <AlertTitle>Historical Decoupling</AlertTitle>
          <AlertDescription className="text-xs">
            Updating the commercial catalog price does not alter or recalculate existing active or
            historical membership agreements.
          </AlertDescription>
        </Alert>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">
                  New Price ($) <span className="text-destructive">*</span>
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={dollarPrice}
                  onChange={(e) => handleDollarChange(e.target.value)}
                  placeholder="49.99"
                  data-testid="input-update-price-dollar"
                />
                <p className="text-[11px] text-muted-foreground mt-1 font-mono">
                  {form.watch('priceAmount')} cents
                </p>
              </div>

              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Currency</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        maxLength={3}
                        className="uppercase font-mono"
                        placeholder="USD"
                        data-testid="input-update-currency"
                        onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={updatePricing.isPending}
                data-testid="cancel-update-pricing-button"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updatePricing.isPending}
                data-testid="submit-update-pricing-button"
              >
                {updatePricing.isPending ? 'Updating...' : 'Update Pricing'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

UpdatePricingDialog.displayName = 'UpdatePricingDialog';
