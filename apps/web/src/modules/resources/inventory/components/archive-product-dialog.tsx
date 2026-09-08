import React, { useState, useEffect } from 'react';
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
import { AlertTriangle, AlertCircle, Archive } from 'lucide-react';
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
            Are you sure you want to archive{' '}
            <span className="font-semibold text-foreground">{product?.name}</span> ({product?.sku})?
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

          <Alert className="bg-amber-50/70 border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertTitle>Catalog Lifecycle Impact</AlertTitle>
            <AlertDescription className="text-xs mt-1">
              Archiving removes this item from active Point-of-Sale catalogs and restock attention
              queues. Historical movement ledgers and audit records remain intact.
            </AlertDescription>
          </Alert>

          {product && product.currentStock > 0 && (
            <p className="text-xs text-muted-foreground bg-muted p-2.5 rounded-md">
              <span className="font-medium text-foreground">Current balance:</span>{' '}
              {product.currentStock} {product.unitOfMeasure} on hand. Archiving does not delete
              physical stock balances.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0 mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirmArchive}
            disabled={isPending}
            className="gap-1.5"
          >
            <Archive className="h-4 w-4" />
            {isPending ? 'Archiving...' : 'Archive Product'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
