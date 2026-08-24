import {
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
import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNotification } from '../../../../app/providers/notification-provider';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormValidationSummary,
} from '../../../../shared/forms';
import { usePlanMutations } from '../hooks/use-plans';
import { createPlanSchema, CreatePlanFormValues } from '../schemas/plan.schema';

export interface PlanFormDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onPlanCreated?: (planId: string) => void;
}

export const PlanFormDialog: React.FC<PlanFormDialogProps> = ({
  open,
  onOpenChange,
  onPlanCreated,
}) => {
  const { createPlan } = usePlanMutations();
  const { success, error: notifyError } = useNotification();
  const [dollarPrice, setDollarPrice] = useState<string>('49.99');

  const form = useForm<CreatePlanFormValues>({
    resolver: zodResolver(createPlanSchema),
    defaultValues: {
      code: '',
      name: '',
      description: '',
      durationInDays: 30,
      priceAmount: 4999,
      priceCurrency: 'USD',
      visitQuota: undefined,
    },
    mode: 'onTouched',
  });

  useEffect(() => {
    if (open) {
      form.reset({
        code: '',
        name: '',
        description: '',
        durationInDays: 30,
        priceAmount: 4999,
        priceCurrency: 'USD',
        visitQuota: undefined,
      });
      setDollarPrice('49.99');
    }
  }, [open, form]);

  const handleDollarChange = (val: string) => {
    setDollarPrice(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0) {
      form.setValue('priceAmount', Math.round(num * 100), { shouldValidate: true });
    }
  };

  const onSubmit = (values: CreatePlanFormValues) => {
    createPlan.mutate(values, {
      onSuccess: (newPlan) => {
        success('Plan Created', `Membership plan "${newPlan.name}" (${newPlan.code}) created.`);
        onOpenChange(false);
        onPlanCreated?.(newPlan.id);
      },
      onError: (err) => {
        notifyError(err, 'Failed to create membership plan');
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md max-h-[90vh] overflow-y-auto"
        data-testid="plan-form-dialog"
      >
        <DialogHeader>
          <DialogTitle>Create Membership Plan</DialogTitle>
          <DialogDescription>
            Add a new commercial membership agreement template to the catalog. New plans start in
            DRAFT status.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
            <FormValidationSummary />

            {/* Code */}
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Plan Code</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="e.g. STD_MONTHLY"
                      className="font-mono uppercase text-sm"
                      data-testid="input-plan-code"
                      onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                    />
                  </FormControl>
                  <FormDescription>
                    Unique identifier (uppercase alphanumeric, underscores, or dashes).
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Plan Name</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="e.g. Standard Monthly Pass"
                      data-testid="input-plan-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ''}
                      placeholder="Optional marketing or commercial details"
                      data-testid="input-plan-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Duration & Quota Row */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="durationInDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Duration (Days)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
                        data-testid="input-plan-duration"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="visitQuota"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Visit Quota</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        placeholder="Unlimited"
                        value={field.value ?? ''}
                        onChange={(e) => {
                          const val = e.target.value ? parseInt(e.target.value, 10) : undefined;
                          field.onChange(val);
                        }}
                        data-testid="input-plan-visit-quota"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Price Row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Price ($ USD) <span className="text-destructive">*</span>
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={dollarPrice}
                  onChange={(e) => handleDollarChange(e.target.value)}
                  placeholder="49.99"
                  data-testid="input-plan-price-dollar"
                />
                <p className="text-[11px] text-muted-foreground mt-1 font-mono">
                  {form.watch('priceAmount')} cents
                </p>
              </div>

              <FormField
                control={form.control}
                name="priceCurrency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Currency</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        maxLength={3}
                        className="uppercase font-mono"
                        placeholder="USD"
                        data-testid="input-plan-currency"
                        onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={createPlan.isPending}
                data-testid="cancel-plan-button"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createPlan.isPending}
                data-testid="submit-plan-button"
              >
                {createPlan.isPending ? 'Creating Plan...' : 'Create Draft Plan'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

PlanFormDialog.displayName = 'PlanFormDialog';
