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
import { Stethoscope, AlertCircle } from 'lucide-react';
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

  const { handleSubmit, control, reset } = form;

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
    if (!asset) return;
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <Stethoscope className="h-5 w-5" />
            <DialogTitle>Log Physical Condition Inspection</DialogTitle>
          </div>
          <DialogDescription>
            Record certified physical inspection rating for <strong>{asset.name}</strong> (
            {asset.assetTag}).
          </DialogDescription>
        </DialogHeader>

        {serverErrorMessage && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Inspection Rating Error</AlertTitle>
            <AlertDescription>{serverErrorMessage}</AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
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
                    Ranks 4 (NEEDS_REPAIR) and 5 (OUT_OF_SERVICE) flag the asset for priority
                    technician attention.
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
                    />
                  </FormControl>
                  <FormDescription>
                    Optional inspector findings recorded in the asset audit log.
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
                {isPending ? 'Saving...' : 'Record Rating'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
