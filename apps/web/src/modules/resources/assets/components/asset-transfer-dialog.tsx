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
import { MapPin, AlertCircle, ArrowRight } from 'lucide-react';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../../../../shared/forms';
import { transferAssetLocationSchema, type TransferAssetLocationFormData } from '../schemas';
import { useTransferAssetLocation } from '../hooks';
import type { FixedAssetVM } from '../types';

export interface TransferAssetLocationDialogProps {
  readonly asset: FixedAssetVM | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess?: () => void;
}

export const TransferAssetLocationDialog: React.FC<TransferAssetLocationDialogProps> = ({
  asset,
  open,
  onOpenChange,
  onSuccess,
}) => {
  const { mutate: transferLocation, isPending } = useTransferAssetLocation();
  const [serverErrorMessage, setServerErrorMessage] = useState<string | null>(null);

  const form = useForm<TransferAssetLocationFormData>({
    resolver: zodResolver(transferAssetLocationSchema),
    defaultValues: {
      location: {
        facilityId: '',
        roomId: '',
        zone: '',
        description: '',
      },
      reason: '',
    },
  });

  const { handleSubmit, control, reset } = form;

  React.useEffect(() => {
    if (open && asset) {
      reset({
        location: {
          facilityId: asset.location.facilityId,
          roomId: asset.location.roomId ?? '',
          zone: asset.location.zone ?? '',
          description: asset.location.description ?? '',
        },
        reason: '',
      });
      setServerErrorMessage(null);
    }
  }, [open, asset, reset]);

  const handleFormSubmit = (data: TransferAssetLocationFormData) => {
    if (!asset) return;
    setServerErrorMessage(null);

    transferLocation(
      {
        id: asset.id,
        payload: {
          location: {
            facilityId: data.location.facilityId.trim(),
            roomId: data.location.roomId?.trim() || undefined,
            zone: data.location.zone?.trim() || undefined,
            description: data.location.description?.trim() || undefined,
          },
          reason: data.reason?.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          onSuccess?.();
        },
        onError: (err: Error) => {
          setServerErrorMessage(err.message || 'Failed to transfer asset location');
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
            <MapPin className="h-5 w-5" />
            <DialogTitle>Transfer Physical Location</DialogTitle>
          </div>
          <DialogDescription>
            Relocate <strong>{asset.name}</strong> ({asset.assetTag}) to a new facility, room, or
            zone. Generates an immutable location audit record.
          </DialogDescription>
        </DialogHeader>

        {/* Current Placement Summary */}
        <div className="rounded-md border border-border bg-muted/40 p-3 text-xs space-y-1">
          <p className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
            Current Placement
          </p>
          <p className="text-foreground">
            Facility: <span className="font-medium font-mono">{asset.location.facilityId}</span>
            {asset.location.roomId && ` • Room: ${asset.location.roomId}`}
            {asset.location.zone && ` • Zone: ${asset.location.zone}`}
          </p>
        </div>

        {serverErrorMessage && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Relocation Error</AlertTitle>
            <AlertDescription>{serverErrorMessage}</AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {/* Destination Facility */}
              <FormField
                control={control}
                name="location.facilityId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Destination Facility</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. fac-west or Campus 2" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Destination Room */}
              <FormField
                control={control}
                name="location.roomId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Room / Studio</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. Recovery Suite B"
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Destination Zone */}
              <FormField
                control={control}
                name="location.zone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Floor / Zone</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. Zone 3, 2nd Floor"
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Placement Description */}
              <FormField
                control={control}
                name="location.description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Landmark Notes</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. Near west windows"
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Transfer Reason */}
            <FormField
              control={control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Transfer Justification</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Studio renovation or operational rebalancing"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormDescription>Preserved in historical location audit ledger.</FormDescription>
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
                <ArrowRight className="mr-1.5 h-4 w-4" />
                {isPending ? 'Transferring...' : 'Execute Transfer'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
