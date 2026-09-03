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
import { MapPin, AlertCircle, ArrowRight, AlertTriangle, Loader2 } from 'lucide-react';
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
import { AssetStatusBadge } from './asset-status-badge';
import { AssetConditionBadge } from './asset-condition-badge';
import { AssetCategoryBadge } from './asset-category-badge';
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

  const isDecommissioned =
    asset?.status === AssetStatus.SOLD || asset?.status === AssetStatus.RETIRED;

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
    if (!asset || isDecommissioned) return;
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
      <DialogContent className="sm:max-w-[540px]" data-testid="transfer-asset-dialog">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <MapPin className="h-5 w-5" />
            <DialogTitle>Transfer Physical Location</DialogTitle>
          </div>
          <DialogDescription>
            Relocate <strong>{asset.name}</strong> ({asset.assetTag}) to a new facility, room, or
            zone. Produces an immutable domain audit history event.
          </DialogDescription>
        </DialogHeader>

        {/* Operational Context Summary (Identity, Current Placement, Status, Condition) */}
        <div
          className="rounded-md border border-border bg-muted/40 p-3 text-xs space-y-2"
          data-testid="transfer-current-placement"
        >
          <div className="flex items-center justify-between">
            <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
              Current Placement
            </span>
            <div className="flex items-center gap-1.5">
              <AssetCategoryBadge category={asset.category} />
              <AssetStatusBadge status={asset.status} />
              <AssetConditionBadge condition={asset.condition} />
            </div>
          </div>
          <p className="text-foreground">
            Facility: <span className="font-medium font-mono">{asset.location.facilityId}</span>
            {asset.location.roomId && ` • Room: ${asset.location.roomId}`}
            {asset.location.zone && ` • Zone: ${asset.location.zone}`}
          </p>
          {asset.location.description && (
            <p className="text-muted-foreground text-[11px] italic">
              Landmark: {asset.location.description}
            </p>
          )}
        </div>

        {/* Terminal State Restriction Alert */}
        {isDecommissioned && (
          <Alert
            variant="destructive"
            className="border-destructive/50 bg-destructive/10 text-destructive"
            data-testid="transfer-terminal-alert"
          >
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Terminal Lifecycle State ({asset.status})</AlertTitle>
            <AlertDescription className="text-xs mt-1">
              Per domain invariants <code>[AST-INV-1]</code> and <code>[AST-INV-2]</code>,
              decommissioned equipment cannot be relocated. Physical transfer is prohibited.
            </AlertDescription>
          </Alert>
        )}

        {serverErrorMessage && (
          <Alert variant="destructive" data-testid="transfer-server-error">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Relocation Error</AlertTitle>
            <AlertDescription>{serverErrorMessage}</AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
            <fieldset disabled={isDecommissioned || isPending} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {/* Destination Facility */}
                <FormField
                  control={control}
                  name="location.facilityId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>Destination Facility</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. fac-west or Campus 2"
                          {...field}
                          data-testid="transfer-facility-input"
                        />
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
                          data-testid="transfer-room-input"
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
                      <FormLabel>Floor / Micro Zone</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. Zone 3, 2nd Floor"
                          {...field}
                          value={field.value ?? ''}
                          data-testid="transfer-zone-input"
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
                      <FormLabel>Placement Landmarks</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. Near west windows"
                          {...field}
                          value={field.value ?? ''}
                          data-testid="transfer-landmark-input"
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
                        data-testid="transfer-reason-input"
                      />
                    </FormControl>
                    <FormDescription>
                      Preserved in historical location audit ledger.
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
                disabled={isDecommissioned || isPending}
                data-testid="transfer-submit-btn"
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    Relocating...
                  </>
                ) : (
                  <>
                    <ArrowRight className="mr-1.5 h-4 w-4" />
                    Execute Transfer
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
