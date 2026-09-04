import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AssetStatus, AssetCondition, ASSET_CONDITION_REGISTRY } from '@kinergy-platform/core';
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
import { Wrench, AlertCircle, AlertTriangle, ArrowRight, Loader2, Info } from 'lucide-react';
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
import { AssetStatusBadge } from './asset-status-badge';
import { AssetConditionBadge } from './asset-condition-badge';
import { AssetCategoryBadge } from './asset-category-badge';
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

  const isTerminalCurrent =
    asset?.status === AssetStatus.SOLD || asset?.status === AssetStatus.RETIRED;

  const isRecoverableStatus =
    asset?.status === AssetStatus.UNDER_MAINTENANCE || asset?.status === AssetStatus.DAMAGED;

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
    if (!asset || isTerminalCurrent) return;
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
      <DialogContent className="sm:max-w-[560px]" data-testid="record-maintenance-dialog">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <Wrench className="h-5 w-5" />
            <DialogTitle>Record Servicing Work Order</DialogTitle>
          </div>
          <DialogDescription>
            Log maintenance, corrective repairs, or preventative servicing for{' '}
            <strong>{asset.name}</strong> ({asset.assetTag}). Produces an immutable maintenance
            ledger entry.
          </DialogDescription>
        </DialogHeader>

        {/* Operational Context Summary */}
        <div
          className="rounded-md border border-border bg-muted/40 p-3 text-xs space-y-2"
          data-testid="maintenance-current-context"
        >
          <div className="flex items-center justify-between">
            <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
              Servicing Context
            </span>
            <div className="flex items-center gap-1.5">
              <AssetCategoryBadge category={asset.category} />
              <AssetStatusBadge status={asset.status} />
              <AssetConditionBadge condition={asset.condition} />
            </div>
          </div>
          <p className="text-foreground">
            Current Placement:{' '}
            <span className="font-medium font-mono">{asset.location.facilityId}</span>
            {asset.location.roomId && ` • ${asset.location.roomId}`}
          </p>
        </div>

        {/* Terminal State Notice */}
        {isTerminalCurrent && (
          <Alert
            variant="destructive"
            className="border-destructive/50 bg-destructive/10 text-destructive"
            data-testid="maintenance-terminal-alert"
          >
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Terminal Lifecycle State ({asset.status})</AlertTitle>
            <AlertDescription className="text-xs mt-1">
              Per domain invariants <code>[AST-INV-1]</code> and <code>[AST-INV-6]</code>,
              decommissioned or sold equipment cannot have routine maintenance work orders logged.
            </AlertDescription>
          </Alert>
        )}

        {/* Domain Auto-Recovery Notice */}
        {isRecoverableStatus && !isTerminalCurrent && (
          <Alert
            className="border-sky-500/30 bg-sky-500/10 text-sky-900 dark:text-sky-200"
            data-testid="maintenance-recovery-hint"
          >
            <Info className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            <AlertTitle>Automatic Lifecycle Recovery</AlertTitle>
            <AlertDescription className="text-xs mt-1">
              Servicing equipment currently marked <code>{asset.status}</code> will automatically
              restore status to <code>ACTIVE</code> if post-service condition is set to a
              serviceable rating (Excellent, Good, or Fair).
            </AlertDescription>
          </Alert>
        )}

        {serverErrorMessage && (
          <Alert variant="destructive" data-testid="maintenance-server-error">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Work Order Error</AlertTitle>
            <AlertDescription>{serverErrorMessage}</AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
            <fieldset disabled={isTerminalCurrent || isPending} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {/* Service Date */}
                <FormField
                  control={control}
                  name="serviceDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>Service Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="maintenance-service-date" />
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
                        <Input
                          placeholder="e.g. LifeFitness Certified Tech"
                          {...field}
                          data-testid="maintenance-performed-by"
                        />
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
                        data-testid="maintenance-desc-input"
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
                      <FormLabel required>Direct Cost ($ USD)</FormLabel>
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
                          data-testid="maintenance-cost-input"
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
                          data-testid="maintenance-condition-select"
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
                        data-testid="maintenance-notes-input"
                      />
                    </FormControl>
                    <FormDescription>
                      Optional invoice number, warranty coverage, or technical remarks.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </fieldset>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isTerminalCurrent || isPending}
                data-testid="maintenance-submit-btn"
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    Recording...
                  </>
                ) : (
                  <>
                    <ArrowRight className="mr-1.5 h-4 w-4" />
                    Record Maintenance
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
