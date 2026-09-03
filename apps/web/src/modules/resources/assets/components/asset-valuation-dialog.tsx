import React, { useState } from 'react';
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
  Alert,
  AlertDescription,
  AlertTitle,
} from '@kinergy-platform/ui';
import { DollarSign, AlertCircle } from 'lucide-react';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../../../../shared/forms';
import { updateAssetValuationSchema, type UpdateAssetValuationFormData } from '../schemas';
import { useUpdateAssetValuation } from '../hooks';
import type { FixedAssetVM } from '../types';

export interface UpdateAssetValuationDialogProps {
  readonly asset: FixedAssetVM | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess?: () => void;
}

export const UpdateAssetValuationDialog: React.FC<UpdateAssetValuationDialogProps> = ({
  asset,
  open,
  onOpenChange,
  onSuccess,
}) => {
  const { mutate: updateValuation, isPending } = useUpdateAssetValuation();
  const [serverErrorMessage, setServerErrorMessage] = useState<string | null>(null);

  const form = useForm<UpdateAssetValuationFormData>({
    resolver: zodResolver(updateAssetValuationSchema),
    defaultValues: {
      estimatedValueAmount: 0,
      currency: 'USD',
      reason: '',
    },
  });

  const { handleSubmit, control, reset } = form;

  React.useEffect(() => {
    if (open && asset) {
      reset({
        estimatedValueAmount: asset.currentEstimatedValueAmount ?? 0,
        currency: asset.purchaseValueCurrency ?? 'USD',
        reason: '',
      });
      setServerErrorMessage(null);
    }
  }, [open, asset, reset]);

  const handleFormSubmit = (data: UpdateAssetValuationFormData) => {
    if (!asset) return;
    setServerErrorMessage(null);

    updateValuation(
      {
        id: asset.id,
        payload: {
          estimatedValueAmount: data.estimatedValueAmount,
          currency: data.currency.trim() || 'USD',
          reason: data.reason?.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          onSuccess?.();
        },
        onError: (err: Error) => {
          setServerErrorMessage(err.message || 'Failed to update asset valuation');
        },
      },
    );
  };

  if (!asset) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <DollarSign className="h-5 w-5" />
            <DialogTitle>Update Carrying Valuation</DialogTitle>
          </div>
          <DialogDescription>
            Record updated fair market or appraised balance sheet valuation for{' '}
            <strong>{asset.name}</strong> ({asset.assetTag}).
          </DialogDescription>
        </DialogHeader>

        {serverErrorMessage && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Valuation Error</AlertTitle>
            <AlertDescription>{serverErrorMessage}</AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
            {/* New Estimated Fair Value */}
            <FormField
              control={control}
              name="estimatedValueAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Current Estimated Value ($)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      {...field}
                      value={field.value ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        field.onChange(val === '' ? undefined : Number(val));
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    Updated fair carrying valuation for corporate balance sheet reporting.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Valuation Reason */}
            <FormField
              control={control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valuation Justification / Appraisal Notes</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Annual asset impairment review or certified re-appraisal"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormDescription>Recorded in financial audit valuation ledger.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                <DollarSign className="mr-1.5 h-4 w-4" />
                {isPending ? 'Updating...' : 'Save Valuation'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
