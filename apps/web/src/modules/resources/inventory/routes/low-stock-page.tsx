import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Badge } from '@kinergy-platform/ui';
import { ArrowLeft, AlertTriangle, Boxes } from 'lucide-react';
import { useLowStockItems } from '../hooks';
import { LowStockAttentionQueue } from '../components/low-stock-attention-queue';
import { ReceiveStockDialog } from '../components/receive-stock-dialog';
import type { InventoryProductVM } from '../types';

export const LowStockPage: React.FC = () => {
  const { data: items, isLoading, isError, error, refetch } = useLowStockItems();
  const [selectedProduct, setSelectedProduct] = useState<InventoryProductVM | null>(null);
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);

  const handleOpenReceiveDialog = (product: InventoryProductVM) => {
    setSelectedProduct(product);
    setReceiveDialogOpen(true);
  };

  return (
    <div className="space-y-6" data-testid="low-stock-page">
      {/* 1. Breadcrumb & Navigation */}
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to="/resources/inventory">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to Catalog
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/resources/inventory/overview">
              <Boxes className="mr-1.5 h-4 w-4" /> Inventory Overview
            </Link>
          </Button>
          <Badge variant="outline">Operational Attention View</Badge>
        </div>
      </div>

      {/* 2. Page Title Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-lg">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Low Stock Attention Queue
            </h1>
            <p className="text-sm text-muted-foreground">
              Operational triage queue identifying depleted consumables and items at or below
              minimum threshold.
            </p>
          </div>
        </div>
      </div>

      {/* 3. Operational Attention Queue & Triage */}
      <LowStockAttentionQueue
        items={items}
        isLoading={isLoading}
        isError={isError}
        errorMessage={error?.message}
        onRetry={() => refetch()}
        onReceiveStock={handleOpenReceiveDialog}
      />

      {/* 4. In-flow Stock Replenishment Dialog */}
      <ReceiveStockDialog
        product={selectedProduct}
        open={receiveDialogOpen}
        onOpenChange={setReceiveDialogOpen}
        onSuccess={() => {
          setReceiveDialogOpen(false);
          refetch();
        }}
      />
    </div>
  );
};
