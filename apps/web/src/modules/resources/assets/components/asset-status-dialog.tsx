import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AssetStatus, AssetCondition, AssetLifecycleStateMachine } from '@kinergy-platform/core';
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
import { ShieldAlert, AlertCircle, AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../../../../shared/forms';
import { changeAssetStatusSchema, type ChangeAssetStatusFormData } from '../schemas';
import { useChangeAssetStatus } from '../hooks';
import { AssetStatusBadge } from './asset-status-badge';
import { AssetConditionBadge } from './asset-condition-badge';
import { AssetCategoryBadge } from './asset-category-badge';
import type { FixedAssetVM } from '../types';

export interface ChangeAssetStatusDialogProps {
  readonly asset: FixedAssetVM | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess?: () => void;
}

type AllowedTargetStatus = Exclude<AssetStatus, AssetStatus.SOLD>;

interface StatusOptionMeta {
  readonly value: AllowedTargetStatus;
  readonly label: string;
  readonly description: string;
}

const STATUS_METADATA: Record<AssetStatus, { label: string; description: string }> = {
  [AssetStatus.ACTIVE]: {
    label: 'Active (In-Service)',
    description: 'Restore equipment to operational availability on the floor.',
  },
  [AssetStatus.UNDER_MAINTENANCE]: {
    label: 'Under Maintenance',
    description: 'Take equipment offline for scheduled servicing or diagnostic repairs.',
  },
  [AssetStatus.DAMAGED]: {
    label: 'Damaged (Safety Incident / Breakdown)',
    description: 'Mark broken down equipment to strictly prohibit client usage.',
  },
  [AssetStatus.RETIRED]: {
    label: 'Retired (Permanent Decommission)',
    description: 'Permanently retire equipment from fleet service [AST-INV-1].',
  },
  [AssetStatus.SOLD]: {
    label: 'Sold (Liquidation Realized)',
    description: 'Asset liquidated; ownership transferred outside business boundary.',
  },
};

export const ChangeAssetStatusDialog: React.FC<ChangeAssetStatusDialogProps> = ({
  asset,
  open,
  onOpenChange,
  onSuccess,
}) => {
  const { mutate: changeStatus, isPending } = useChangeAssetStatus();
  const [serverErrorMessage, setServerErrorMessage] = useState<string | null>(null);

  const form = useForm<ChangeAssetStatusFormData>({
    resolver: zodResolver(changeAssetStatusSchema),
    defaultValues: {
      status: AssetStatus.UNDER_MAINTENANCE,
      reason: '',
    },
  });

  const { handleSubmit, control, watch, reset, setValue } = form;
  const selectedTargetStatus = watch('status');

  // Authoritative State Machine Evaluation
  const currentStatus = asset?.status ?? AssetStatus.ACTIVE;
  const isTerminalCurrent =
    currentStatus === AssetStatus.SOLD || currentStatus === AssetStatus.RETIRED;

  // Retrieve allowed destination transitions from the domain state machine
  // Direct change to 'SOLD' is prohibited by domain rules (requires liquidation method)
  const allowedTransitions: StatusOptionMeta[] = React.useMemo(() => {
    if (!asset || isTerminalCurrent) return [];
    const domainAllowed = AssetLifecycleStateMachine.getAllowedTransitions(currentStatus);
    return domainAllowed
      .filter(
        (target): target is AllowedTargetStatus =>
          target !== AssetStatus.SOLD && target !== currentStatus,
      )
      .map((target) => ({
        value: target,
        label: STATUS_METADATA[target]?.label ?? target,
        description: STATUS_METADATA[target]?.description ?? '',
      }));
  }, [asset, currentStatus, isTerminalCurrent]);

  React.useEffect(() => {
    if (open && asset) {
      const defaultTarget = allowedTransitions[0]?.value ?? AssetStatus.UNDER_MAINTENANCE;
      reset({
        status: defaultTarget,
        reason: '',
      });
      setServerErrorMessage(null);
    }
  }, [open, asset, reset, allowedTransitions]);

  const isRestoringToActive = selectedTargetStatus === AssetStatus.ACTIVE;
  const isOutOfServiceCondition = asset?.condition === AssetCondition.OUT_OF_SERVICE;
  const isConditionRestoringBlocked = isRestoringToActive && isOutOfServiceCondition;

  const isRetiring = selectedTargetStatus === AssetStatus.RETIRED;

  const handleFormSubmit = (data: ChangeAssetStatusFormData) => {
    if (!asset || isTerminalCurrent || isConditionRestoringBlocked) return;
    setServerErrorMessage(null);

    changeStatus(
      {
        id: asset.id,
        payload: {
          status: data.status,
          reason: data.reason.trim(),
        },
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          onSuccess?.();
        },
        onError: (err: Error) => {
          setServerErrorMessage(err.message || 'Failed to change asset status');
        },
      },
    );
  };

  if (!asset) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px]" data-testid="change-status-dialog">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <ShieldAlert className="h-5 w-5" />
            <DialogTitle>Transition Lifecycle Status</DialogTitle>
          </div>
          <DialogDescription>
            Transition operational lifecycle state for <strong>{asset.name}</strong> (
            {asset.assetTag}).
          </DialogDescription>
        </DialogHeader>

        {/* Operational Context Summary (Current Status, Placement, Condition) */}
        <div
          className="rounded-md border border-border bg-muted/40 p-3 text-xs space-y-2"
          data-testid="status-current-context"
        >
          <div className="flex items-center justify-between">
            <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
              Current Lifecycle State
            </span>
            <div className="flex items-center gap-1.5">
              <AssetCategoryBadge category={asset.category} />
              <AssetStatusBadge status={asset.status} />
              <AssetConditionBadge condition={asset.condition} />
            </div>
          </div>
          <p className="text-foreground">
            Current Status:{' '}
            <span className="font-medium font-mono">
              {STATUS_METADATA[asset.status]?.label ?? asset.status}
            </span>
          </p>
        </div>

        {/* Terminal State Alert */}
        {isTerminalCurrent && (
          <Alert
            variant="destructive"
            className="border-destructive/50 bg-destructive/10 text-destructive"
            data-testid="status-terminal-alert"
          >
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Terminal Lifecycle State ({currentStatus})</AlertTitle>
            <AlertDescription className="text-xs mt-1">
              Per domain invariants <code>[AST-INV-1]</code> and <code>[AST-INV-2]</code>,
              decommissioned equipment ({currentStatus}) cannot return to active service. Status
              transitions are permanently locked.
            </AlertDescription>
          </Alert>
        )}

        {/* Condition Out of Service Blocked Notice */}
        {isConditionRestoringBlocked && (
          <Alert
            variant="destructive"
            className="border-destructive/50 bg-destructive/10 text-destructive"
            data-testid="status-condition-block-alert"
          >
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Cannot Restore to Active (Condition Blocked)</AlertTitle>
            <AlertDescription className="text-xs mt-1">
              Per domain rules, an asset with physical condition <code>OUT_OF_SERVICE</code> cannot
              return to <code>ACTIVE</code> status. Perform repairs and upgrade condition first.
            </AlertDescription>
          </Alert>
        )}

        {/* Retiring Warning */}
        {isRetiring && !isTerminalCurrent && (
          <Alert
            variant="destructive"
            className="border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200"
            data-testid="status-retire-warning"
          >
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertTitle>Terminal Invariant Notice ([AST-INV-1])</AlertTitle>
            <AlertDescription className="text-xs mt-1">
              Retiring an asset permanently decommissions it from fleet service. Once retired, the
              equipment cannot be restored to ACTIVE or serviced.
            </AlertDescription>
          </Alert>
        )}

        {serverErrorMessage && (
          <Alert variant="destructive" data-testid="status-server-error">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Transition Error</AlertTitle>
            <AlertDescription>{serverErrorMessage}</AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
            <fieldset disabled={isTerminalCurrent || isPending} className="space-y-4">
              {/* Valid Target Status Radio / Select Options */}
              <FormField
                control={control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Valid Target Operational Status</FormLabel>
                    <FormControl>
                      {allowedTransitions.length > 0 ? (
                        <div className="space-y-2" data-testid="allowed-status-options">
                          {allowedTransitions.map((opt) => (
                            <label
                              key={opt.value}
                              className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
                                field.value === opt.value
                                  ? 'border-primary bg-primary/5 text-foreground'
                                  : 'border-border hover:bg-muted/40 text-muted-foreground'
                              }`}
                            >
                              <input
                                type="radio"
                                className="mt-1 h-4 w-4 text-primary focus:ring-primary"
                                name="status-transition"
                                value={opt.value}
                                checked={field.value === opt.value}
                                onChange={() => setValue('status', opt.value)}
                                data-testid={`status-option-${opt.value}`}
                              />
                              <div className="space-y-0.5">
                                <p className="text-sm font-medium text-foreground">{opt.label}</p>
                                <p className="text-xs text-muted-foreground">{opt.description}</p>
                              </div>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <p
                          className="text-xs text-muted-foreground italic py-2"
                          data-testid="no-transitions-message"
                        >
                          No valid operational transitions available from current state.
                        </p>
                      )}
                    </FormControl>
                    <FormDescription>
                      Transitions are restricted to verified domain state machine paths.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Transition Justification Reason */}
              <FormField
                control={control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Operational Justification Reason</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. Belt slipped during workout; removed from floor for inspection"
                        {...field}
                        data-testid="status-reason-input"
                      />
                    </FormControl>
                    <FormDescription>
                      Must be at least 3 characters. Recorded in the immutable lifecycle audit log.
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
                disabled={
                  isTerminalCurrent ||
                  isPending ||
                  allowedTransitions.length === 0 ||
                  isConditionRestoringBlocked
                }
                data-testid="status-submit-btn"
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    Transitioning...
                  </>
                ) : (
                  <>
                    <ArrowRight className="mr-1.5 h-4 w-4" />
                    Apply Status Transition
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
