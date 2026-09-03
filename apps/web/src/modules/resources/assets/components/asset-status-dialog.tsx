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
import { ShieldAlert, AlertCircle, AlertTriangle } from 'lucide-react';
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
import type { FixedAssetVM } from '../types';

export interface ChangeAssetStatusDialogProps {
  readonly asset: FixedAssetVM | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess?: () => void;
}

const STATUS_TRANSITION_OPTIONS = [
  { value: AssetStatus.ACTIVE, label: 'Active (Fleet In-Service)' },
  { value: AssetStatus.UNDER_MAINTENANCE, label: 'Under Maintenance (Staged for Servicing)' },
  { value: AssetStatus.DAMAGED, label: 'Damaged (Offline / Repair Required)' },
  { value: AssetStatus.RETIRED, label: 'Retired (Decommissioned from Fleet)' },
];

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
      status: AssetStatus.ACTIVE,
      reason: '',
    },
  });

  const { handleSubmit, control, watch, reset } = form;
  const selectedStatus = watch('status');

  React.useEffect(() => {
    if (open && asset) {
      const initialStatus = asset.status === AssetStatus.SOLD ? AssetStatus.RETIRED : asset.status;
      reset({
        status: initialStatus,
        reason: '',
      });
      setServerErrorMessage(null);
    }
  }, [open, asset, reset]);

  const handleFormSubmit = (data: ChangeAssetStatusFormData) => {
    if (!asset) return;
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

  const isTerminalSelected = selectedStatus === AssetStatus.RETIRED;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <ShieldAlert className="h-5 w-5" />
            <DialogTitle>Transition Lifecycle Status</DialogTitle>
          </div>
          <DialogDescription>
            Update operational state for <strong>{asset.name}</strong> ({asset.assetTag}).
          </DialogDescription>
        </DialogHeader>

        {serverErrorMessage && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Transition Error</AlertTitle>
            <AlertDescription>{serverErrorMessage}</AlertDescription>
          </Alert>
        )}

        {isTerminalSelected && (
          <Alert
            variant="destructive"
            className="border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200"
          >
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertTitle>Terminal Invariant Notice</AlertTitle>
            <AlertDescription className="text-xs mt-1">
              Retiring an asset permanently decommissions it from operational use. Per domain
              invariant <code>[AST-INV-1]</code>, this transition is irreversible.
            </AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
            {/* Target Status Select */}
            <FormField
              control={control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Target Operational Status</FormLabel>
                  <FormControl>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      {...field}
                    >
                      {STATUS_TRANSITION_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormDescription>
                    Governs whether equipment is schedulable and available for members.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Transition Reason */}
            <FormField
              control={control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Operational Justification</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Belt slipped during member workout; scheduled technician"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Mandatory justification reason preserved in the audit event ledger (min 3
                    chars).
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
              <Button
                type="submit"
                variant={isTerminalSelected ? 'destructive' : 'default'}
                disabled={isPending}
              >
                {isPending
                  ? 'Updating...'
                  : isTerminalSelected
                    ? 'Retire Equipment'
                    : 'Update Status'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
