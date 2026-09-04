import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AssetStatus } from '@kinergy-platform/core';
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
import { DollarSign, AlertCircle, AlertTriangle, ArrowRight, Loader2, Lock } from 'lucide-react';
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
import { useAuth } from '../../../../app/providers/auth-provider';
import { AssetStatusBadge } from './asset-status-badge';
import { AssetCategoryBadge } from './asset-category-badge';
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
  const { hasPermission, hasRole } = useAuth();
  const { mutate: updateValuation, isPending } = useUpdateAssetValuation();
  const [serverErrorMessage, setServerErrorMessage] = useState<string | null>(null);

  // Dual-permission check (assets.write + billing.read/valuation.read)
  const isSuperAdmin = Boolean(hasRole('ADMIN') || hasRole('SUPER_ADMIN') || hasRole('OWNER'));
  const hasAssetsWrite = Boolean(hasPermission('assets.write') || isSuperAdmin);
  const hasBillingRead = Boolean(
    hasPermission('billing.read') || hasPermission('valuation.read') || isSuperAdmin,
  );
  const isAuthorized = hasAssetsWrite && hasBillingRead;

  const isSold = asset?.status === AssetStatus.SOLD;

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
    if (!asset || isSold || !isAuthorized) return;
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
      <DialogContent className="sm:max-w-[500px]" data-testid="update-valuation-dialog">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <DollarSign className="h-5 w-5" />
            <DialogTitle>Update Carrying Valuation</DialogTitle>
          </div>
          <DialogDescription>
            Record updated fair market appraisal or impairment adjustment for{' '}
            <strong>{asset.name}</strong> ({asset.assetTag}). Produces an immutable valuation audit
            record.
          </DialogDescription>
        </DialogHeader>

        {/* Valuation Context Summary */}
        <div
          className="rounded-md border border-border bg-muted/40 p-3 text-xs space-y-2"
          data-testid="valuation-current-context"
        >
          <div className="flex items-center justify-between">
            <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
              Carrying Valuation Context
            </span>
            <div className="flex items-center gap-1.5">
              <AssetCategoryBadge category={asset.category} />
              <AssetStatusBadge status={asset.status} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/50">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Original Cost</p>
              <p className="font-mono font-medium text-foreground">
                $
                {(asset.purchaseValueAmount ?? 0).toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                })}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Current Book Value</p>
              <p className="font-mono font-semibold text-foreground">
                $
                {(asset.currentEstimatedValueAmount ?? 0).toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                })}
              </p>
            </div>
          </div>
        </div>

        {/* Permission Barrier Alert */}
        {!isAuthorized && (
          <Alert
            variant="destructive"
            className="border-destructive/50 bg-destructive/10 text-destructive"
            data-testid="valuation-permission-alert"
          >
            <Lock className="h-4 w-4" />
            <AlertTitle>Dual-Permission Authorization Required</AlertTitle>
            <AlertDescription className="text-xs mt-1">
              Modifying capital carrying valuations requires both <code>assets.write</code> and{' '}
              <code>billing.read</code> permissions. Your current session does not hold required
              financial credentials.
            </AlertDescription>
          </Alert>
        )}

        {/* Terminal Sold Alert */}
        {isSold && (
          <Alert
            variant="destructive"
            className="border-destructive/50 bg-destructive/10 text-destructive"
            data-testid="valuation-terminal-alert"
          >
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Terminal Realized Valuation (SOLD)</AlertTitle>
            <AlertDescription className="text-xs mt-1">
              Per domain invariant <code>[AST-INV-1]</code>, liquidated property in SOLD status has
              its realization value locked permanently. Re-appraisal is prohibited.
            </AlertDescription>
          </Alert>
        )}

        {serverErrorMessage && (
          <Alert variant="destructive" data-testid="valuation-server-error">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Valuation Error</AlertTitle>
            <AlertDescription>{serverErrorMessage}</AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
            <fieldset disabled={!isAuthorized || isSold || isPending} className="space-y-4">
              {/* New Estimated Fair Value */}
              <FormField
                control={control}
                name="estimatedValueAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Current Estimated Fair Value ($ USD)</FormLabel>
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
                        data-testid="valuation-amount-input"
                      />
                    </FormControl>
                    <FormDescription>
                      Must be non-negative ($0.00 or greater). Authoritative balance sheet
                      appraisal.
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
                        data-testid="valuation-reason-input"
                      />
                    </FormControl>
                    <FormDescription>
                      Preserved in historical corporate valuation audit log.
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
                disabled={!isAuthorized || isSold || isPending}
                data-testid="valuation-submit-btn"
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    Appraising...
                  </>
                ) : (
                  <>
                    <ArrowRight className="mr-1.5 h-4 w-4" />
                    Update Valuation
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
