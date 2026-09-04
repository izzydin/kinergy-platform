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
import { Stethoscope, AlertCircle, AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../../../../shared/forms';
import { updateAssetConditionSchema, type UpdateAssetConditionFormData } from '../schemas';
import { useUpdateAssetCondition } from '../hooks';
import { AssetStatusBadge } from './asset-status-badge';
import { AssetConditionBadge } from './asset-condition-badge';
import { AssetCategoryBadge } from './asset-category-badge';
import type { FixedAssetVM } from '../types';

export interface UpdateAssetConditionDialogProps {
  readonly asset: FixedAssetVM | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess?: () => void;
}

export const UpdateAssetConditionDialog: React.FC<UpdateAssetConditionDialogProps> = ({
  asset,
  open,
  onOpenChange,
  onSuccess,
}) => {
  const { mutate: updateCondition, isPending } = useUpdateAssetCondition();
  const [serverErrorMessage, setServerErrorMessage] = useState<string | null>(null);

  const form = useForm<UpdateAssetConditionFormData>({
    resolver: zodResolver(updateAssetConditionSchema),
    defaultValues: {
      condition: AssetCondition.EXCELLENT,
      reason: '',
    },
  });

  const { handleSubmit, control, watch, reset } = form;
  const selectedCondition = watch('condition');

  const isTerminalCurrent =
    asset?.status === AssetStatus.SOLD || asset?.status === AssetStatus.RETIRED;

  React.useEffect(() => {
    if (open && asset) {
      reset({
        condition: asset.condition,
        reason: '',
      });
      setServerErrorMessage(null);
    }
  }, [open, asset, reset]);

  const handleFormSubmit = (data: UpdateAssetConditionFormData) => {
    if (!asset || isTerminalCurrent) return;
    setServerErrorMessage(null);

    updateCondition(
      {
        id: asset.id,
        payload: {
          condition: data.condition,
          reason: data.reason?.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          onSuccess?.();
        },
        onError: (err: Error) => {
          setServerErrorMessage(err.message || 'Failed to update asset condition');
        },
      },
    );
  };

  if (!asset) return null;

  const isSevereCondition =
    selectedCondition === AssetCondition.NEEDS_REPAIR ||
    selectedCondition === AssetCondition.OUT_OF_SERVICE;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]" data-testid="update-condition-dialog">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <Stethoscope className="h-5 w-5" />
            <DialogTitle>Log Physical Condition Inspection</DialogTitle>
          </div>
          <DialogDescription>
            Record certified physical inspection rating for <strong>{asset.name}</strong> (
            {asset.assetTag}). Produces an immutable audit history event.
          </DialogDescription>
        </DialogHeader>

        {/* Operational Context Summary */}
        <div
          className="rounded-md border border-border bg-muted/40 p-3 text-xs space-y-2"
          data-testid="condition-current-context"
        >
          <div className="flex items-center justify-between">
            <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
              Inspected Equipment Context
            </span>
            <div className="flex items-center gap-1.5">
              <AssetCategoryBadge category={asset.category} />
              <AssetStatusBadge status={asset.status} />
              <AssetConditionBadge condition={asset.condition} />
            </div>
          </div>
          <p className="text-foreground">
            Current Condition:{' '}
            <span className="font-medium font-mono">
              {ASSET_CONDITION_REGISTRY[asset.condition]?.displayName ?? asset.condition} (Rank{' '}
              {ASSET_CONDITION_REGISTRY[asset.condition]?.severityRank})
            </span>
          </p>
        </div>

        {/* Terminal State Notice */}
        {isTerminalCurrent && (
          <Alert
            variant="destructive"
            className="border-destructive/50 bg-destructive/10 text-destructive"
            data-testid="condition-terminal-alert"
          >
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Terminal Lifecycle State ({asset.status})</AlertTitle>
            <AlertDescription className="text-xs mt-1">
              Per domain invariants <code>[AST-INV-1]</code> and <code>[AST-INV-2]</code>,
              decommissioned or sold equipment cannot have physical inspections or condition ratings
              updated.
            </AlertDescription>
          </Alert>
        )}

        {/* Priority Technician Alert when rating severe */}
        {isSevereCondition && !isTerminalCurrent && (
          <Alert
            variant="destructive"
            className="border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200"
            data-testid="condition-severe-alert"
          >
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertTitle>Priority Maintenance Trigger</AlertTitle>
            <AlertDescription className="text-xs mt-1">
              Rating equipment as{' '}
              <strong>
                {ASSET_CONDITION_REGISTRY[selectedCondition]?.displayName ?? selectedCondition}
              </strong>{' '}
              flags it for prioritized technician maintenance and may restrict operational
              scheduling.
            </AlertDescription>
          </Alert>
        )}

        {serverErrorMessage && (
          <Alert variant="destructive" data-testid="condition-server-error">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Inspection Rating Error</AlertTitle>
            <AlertDescription>{serverErrorMessage}</AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
            <fieldset disabled={isTerminalCurrent || isPending} className="space-y-4">
              {/* Condition Rating Select */}
              <FormField
                control={control}
                name="condition"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Inspected Physical Condition</FormLabel>
                    <FormControl>
                      <select
                        className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                        {...field}
                        data-testid="condition-select"
                      >
                        {Object.values(AssetCondition).map((cond) => (
                          <option key={cond} value={cond}>
                            {`Rank ${ASSET_CONDITION_REGISTRY[cond]?.severityRank ?? ''} • ${
                              ASSET_CONDITION_REGISTRY[cond]?.displayName ?? cond
                            }`}
                          </option>
                        ))}
                      </select>
                    </FormControl>
                    <FormDescription>
                      Certified physical evaluation according to standardized severity hierarchy
                      (1–5).
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Inspection Findings / Reason */}
              <FormField
                control={control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Inspection Remarks / Findings</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. Quarterly physical checkup; cosmetic scratches on housing"
                        {...field}
                        value={field.value ?? ''}
                        data-testid="condition-reason-input"
                      />
                    </FormControl>
                    <FormDescription>
                      Optional findings preserved in immutable condition audit log.
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
                data-testid="condition-submit-btn"
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    Recording...
                  </>
                ) : (
                  <>
                    <ArrowRight className="mr-1.5 h-4 w-4" />
                    Record Inspection
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
