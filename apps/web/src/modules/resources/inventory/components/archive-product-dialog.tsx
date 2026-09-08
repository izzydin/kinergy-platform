import React, { useState, useEffect, useRef } from 'react';
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
import { AlertCircle, Archive, CheckCircle2, Info } from 'lucide-react';
import { useArchiveProduct } from '../hooks';
import type { InventoryProductVM } from '../types';

export interface ArchiveProductDialogProps {
  readonly product: InventoryProductVM | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onArchived?: () => void;
}

export const ArchiveProductDialog: React.FC<ArchiveProductDialogProps> = ({
  product,
  open,
  onOpenChange,
  onArchived,
}) => {
  const { mutate: archiveProduct, isPending } = useArchiveProduct();
  const [serverErrorMessage, setServerErrorMessage] = useState<string | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      setServerErrorMessage(null);
    }
  }, [open]);

  const handleConfirmArchive = () => {
    if (!product) return;
    setServerErrorMessage(null);

    archiveProduct(product.id, {
      onSuccess: () => {
        onOpenChange(false);
        onArchived?.();
      },
      onError: (err: Error) => {
        setServerErrorMessage(err.message || 'Failed to archive product');
      },
    });
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (isPending) return;
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-md"
        data-testid="archive-product-dialog"
        onOpenAutoFocus={(e) => {
          // Safe by default: place initial focus on Cancel button to avoid accidental Enter submission
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
            <Archive className="h-5 w-5" />
            <DialogTitle>Archive Consumable Product</DialogTitle>
          </div>
          <DialogDescription>
            Delist this consumable product from active operations. Review the lifecycle impact and
            confirm catalog deactivation below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {serverErrorMessage && (
            <Alert
              variant="destructive"
              className="py-2.5"
              data-testid="archive-product-error-alert"
            >
              <AlertCircle className="h-4 w-4" />
              <AlertTitle className="text-xs font-semibold">Archiving Failed</AlertTitle>
              <AlertDescription className="text-xs mt-0.5">{serverErrorMessage}</AlertDescription>
            </Alert>
          )}

          {/* 1. Affected Resource Summary */}
          {product && (
            <div
              className="rounded-md border border-border bg-muted/50 p-3 text-xs space-y-1"
              data-testid="archive-resource-summary"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground text-sm">{product.name}</span>
                <span className="font-mono text-muted-foreground text-[11px]">{product.sku}</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground pt-1 border-t border-border/40">
                <span>Category: {product.category}</span>
                <span>
                  Balance: {product.currentStock} {product.unitOfMeasure}
                </span>
              </div>
            </div>
          )}

          {/* 2. What Will Happen (Catalog Impact) */}
          <Alert className="bg-amber-50/70 border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300">
            <Info className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertTitle>Catalog Lifecycle Impact</AlertTitle>
            <AlertDescription className="text-xs mt-1">
              Archiving immediately removes this item from Point-of-Sale (POS) catalogs and
              automated restock alerts. Existing stock balances and historical movement ledgers are
              preserved.
            </AlertDescription>
          </Alert>

          {/* 3. Reversibility Disclosure */}
          <Alert className="bg-emerald-50/70 border-emerald-200 text-emerald-900 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <AlertTitle>Reversible Action</AlertTitle>
            <AlertDescription className="text-xs mt-1">
              This product can be reactivated back to active catalog status at any time from the
              archived items filter view.
            </AlertDescription>
          </Alert>

          {/* 4. Confirmation Instructions */}
          <p className="text-xs text-muted-foreground">
            To proceed with delisting this item from active sales, click{' '}
            <span className="font-medium text-foreground">Archive Product</span> below.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 mt-4">
          <Button
            ref={cancelButtonRef}
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            data-testid="archive-cancel-btn"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirmArchive}
            disabled={isPending}
            className="gap-1.5"
            data-testid="archive-confirm-btn"
          >
            <Archive className="h-4 w-4" />
            {isPending ? 'Archiving...' : 'Archive Product'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
