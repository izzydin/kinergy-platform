import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AssetCondition, ASSET_CONDITION_REGISTRY } from '@kinergy-platform/core';
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
import { Wrench, AlertCircle } from 'lucide-react';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../../../../shared/forms';
import { recordAssetMaintenanceSchema, type RecordAssetMaintenanceFormData } from '../schemas';
import { useRecordAssetMaintenance } from '../hooks';
import type { FixedAssetVM } from '../types';

export interface RecordAssetMaintenanceDialogProps {
  readonly asset: FixedAssetVM | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess?: () => void;
}

export const RecordAssetMaintenanceDialog: React.FC<RecordAssetMaintenanceDialogProps> = ({
  asset,
  open,
  onOpenChange,
  onSuccess,
}) => {
  const { mutate: recordMaintenance, isPending } = useRecordAssetMaintenance();
  const [serverErrorMessage, setServerErrorMessage] = useState<string | null>(null);

  const form = useForm<RecordAssetMaintenanceFormData>({
    resolver: zodResolver(recordAssetMaintenanceSchema),
    defaultValues: {
      serviceDate: new Date().toISOString().split('T')[0],
      description: '',
      costAmount: 0,
      costCurrency: 'USD',
      performedBy: '',
      updateConditionTo: undefined,
      notes: '',
    },
  });

  const { handleSubmit, control, reset } = form;

  React.useEffect(() => {
    if (open && asset) {
      reset({
        serviceDate: new Date().toISOString().split('T')[0],
        description: '',
        costAmount: 0,
        costCurrency: 'USD',
        performedBy: '',
        updateConditionTo: asset.condition,
        notes: '',
      });
      setServerErrorMessage(null);
    }
  }, [open, asset, reset]);

  const handleFormSubmit = (data: RecordAssetMaintenanceFormData) => {
    if (!asset) return;
    setServerErrorMessage(null);

    recordMaintenance(
      {
        id: asset.id,
        payload: {
          serviceDate: data.serviceDate,
          description: data.description.trim(),
          costAmount: data.costAmount,
          costCurrency: data.costCurrency.trim() || 'USD',
          performedBy: data.performedBy.trim(),
          updateConditionTo: data.updateConditionTo,
          notes: data.notes?.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          onSuccess?.();
        },
        onError: (err: Error) => {
          setServerErrorMessage(err.message || 'Failed to record maintenance work order');
        },
      },
    );
  };

  if (!asset) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <Wrench className="h-5 w-5" />
            <DialogTitle>Record Servicing Work Order</DialogTitle>
          </div>
          <DialogDescription>
            Log maintenance, servicing, or parts replacement for <strong>{asset.name}</strong> (
            {asset.assetTag}).
          </DialogDescription>
        </DialogHeader>

        {serverErrorMessage && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Work Order Error</AlertTitle>
            <AlertDescription>{serverErrorMessage}</AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {/* Service Date */}
              <FormField
                control={control}
                name="serviceDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Service Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Performed By */}
              <FormField
                control={control}
                name="performedBy"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Technician / Vendor</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Acme Fitness Service" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Description */}
            <FormField
              control={control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Work Order Summary</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Replaced drive belt and recalibrated electronic speed sensors"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Summary of mechanical or electrical work performed (min 3 characters).
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              {/* Cost Amount */}
              <FormField
                control={control}
                name="costAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Direct Cost ($)</FormLabel>
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
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Post-Service Condition Rating */}
              <FormField
                control={control}
                name="updateConditionTo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Post-Service Condition</FormLabel>
                    <FormControl>
                      <select
                        className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) =>
                          field.onChange(
                            e.target.value ? (e.target.value as AssetCondition) : undefined,
                          )
                        }
                      >
                        <option value="">Leave unchanged</option>
                        {Object.values(AssetCondition).map((cond) => (
                          <option key={cond} value={cond}>
                            {`Rank ${ASSET_CONDITION_REGISTRY[cond]?.severityRank ?? ''} • ${
                              ASSET_CONDITION_REGISTRY[cond]?.displayName ?? cond
                            }`}
                          </option>
                        ))}
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Notes / Invoice Reference */}
            <FormField
              control={control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Invoice Reference / Parts Replaced</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Invoice #INV-8821; OEM Drive Belt Part #DB-9900"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormDescription>
                    Optional invoice number, warranty coverage, or technical remarks.
                  </FormDescription>
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
                <Wrench className="mr-1.5 h-4 w-4" />
                {isPending ? 'Recording...' : 'Record Maintenance'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
