import React, { useRef } from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@kinergy-platform/ui';
import { ShieldAlert, AlertTriangle, Loader2 } from 'lucide-react';
import { AssetCategoryBadge } from './asset-category-badge';
import type { FixedAssetVM } from '../types';

export interface RetireAssetDialogProps {
  readonly asset: FixedAssetVM | null;
  readonly open: boolean;
  readonly reason: string;
  readonly isPending: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: () => void;
}

/**
 * RetireAssetDialog
 *
 * Dedicated destructive confirmation gate required before an asset can be
 * permanently transitioned to the terminal RETIRED state per invariant [AST-INV-1].
 *
 * Communicates:
 * 1. What will happen (terminal fleet decommission, all mutations locked)
 * 2. Which resource is affected (name, assetTag, category, facility placement)
 * 3. Whether the action can be reversed (PERMANENT & IRREVERSIBLE)
 * 4. What the operator must do to confirm
 */
export const RetireAssetDialog: React.FC<RetireAssetDialogProps> = ({
  asset,
  open,
  reason,
  isPending,
  onOpenChange,
  onConfirm,
}) => {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  if (!asset) return null;

  const handleOpenChange = (nextOpen: boolean) => {
    if (isPending) return;
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-[500px]"
        data-testid="retire-asset-dialog"
        onOpenAutoFocus={(e) => {
          // Safe by default: place initial focus on Cancel button
          e.preventDefault();
          cancelButtonRef.current?.focus();
        }}
        onPointerDownOutside={(e) => {
          if (isPending) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (isPending) e.preventDefault();
        }}
      >
        <DialogHeader>
          <div className="flex items-center gap-2 text-destructive">
            <ShieldAlert className="h-5 w-5" />
            <DialogTitle>Retire Fixed Asset Permanently</DialogTitle>
          </div>
          <DialogDescription>
            Confirm terminal decommissioning for this equipment from operational fleet service.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* 1. Affected Resource Summary */}
          <div
            className="rounded-md border border-border bg-muted/50 p-3 text-xs space-y-2"
            data-testid="retire-resource-summary"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground text-sm">{asset.name}</span>
              <AssetCategoryBadge category={asset.category} />
            </div>
            <div className="grid grid-cols-2 gap-2 text-muted-foreground pt-1 border-t border-border/40">
              <div>
                <span>Asset Tag: </span>
                <span className="font-mono font-medium text-foreground">{asset.assetTag}</span>
              </div>
              <div>
                <span>Location: </span>
                <span className="font-medium text-foreground">
                  {asset.location.facilityId}
                  {asset.location.roomId ? ` / ${asset.location.roomId}` : ''}
                </span>
              </div>
            </div>
            {reason && (
              <div className="pt-1 border-t border-border/40 text-[11px]">
                <span className="text-muted-foreground font-semibold">Stated Reason: </span>
                <span className="italic text-foreground">{reason}</span>
              </div>
            )}
          </div>

          {/* 2. What Will Happen */}
          <Alert className="bg-amber-50/70 border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertTitle>Operational Fleet Decommission</AlertTitle>
            <AlertDescription className="text-xs mt-1">
              Retiring this equipment immediately locks all future operational mutations. Location
              transfers, servicing/maintenance work orders, and physical condition ratings will be
              permanently disabled.
            </AlertDescription>
          </Alert>

          {/* 3. Reversibility Disclosure: IRREVERSIBLE */}
          <Alert
            variant="destructive"
            className="border-destructive/60 bg-destructive/10 text-destructive"
            data-testid="retire-irreversible-alert"
          >
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Permanent & Irreversible Invariant ([AST-INV-1])</AlertTitle>
            <AlertDescription className="text-xs mt-1">
              Under domain rules, decommissioning to RETIRED is an irreversible terminal state. Once
              retired, this equipment cannot be restored to ACTIVE service or recommissioned under
              any circumstance.
            </AlertDescription>
          </Alert>

          {/* 4. Confirmation Instructions */}
          <p className="text-xs text-muted-foreground">
            To proceed with decommissioning this asset, click{' '}
            <span className="font-semibold text-destructive">Retire Asset Permanently</span> below.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 mt-4">
          <Button
            ref={cancelButtonRef}
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            data-testid="retire-cancel-btn"
          >
            Cancel / Keep in Service
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={isPending}
            className="gap-1.5"
            data-testid="retire-confirm-btn"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Retiring Asset...
              </>
            ) : (
              <>
                <ShieldAlert className="h-4 w-4" />
                Retire Asset Permanently
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
