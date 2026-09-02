import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Alert,
  AlertDescription,
  AlertTitle,
  Skeleton,
} from '@kinergy-platform/ui';
import {
  ArrowLeft,
  Edit,
  PackagePlus,
  Scale,
  Archive,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Boxes,
  DollarSign,
  Info,
  Calendar,
  Layers,
  Lock,
  CheckCircle2,
} from 'lucide-react';
import {
  INVENTORY_CATEGORY_REGISTRY,
  UNIT_OF_MEASURE_REGISTRY,
  InventoryItemStatus,
} from '@kinergy-platform/core';
import { useAuth } from '../../../../app/providers/auth-provider';
import { useInventoryProduct } from '../hooks';
import { InventoryStatusBadge } from '../components/inventory-status-badge';
import { ProductMovementsPreview } from '../components/product-movements-preview';
import { ReceiveStockDialog } from '../components/receive-stock-dialog';
import { AdjustStockDialog } from '../components/adjust-stock-dialog';
import { ArchiveProductDialog } from '../components/archive-product-dialog';

export const InventoryDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasPermission, hasRole } = useAuth();

  // Permission evaluation
  const canWriteInventory =
    hasPermission('inventory.write') ||
    hasRole('ADMIN') ||
    hasRole('SUPER_ADMIN') ||
    hasRole('OWNER') ||
    hasRole('KITCHEN_STAFF');

  const canArchive =
    hasPermission('inventory.write') &&
    (hasRole('ADMIN') || hasRole('SUPER_ADMIN') || hasRole('OWNER'));

  const canViewCost =
    hasRole('ADMIN') ||
    hasRole('SUPER_ADMIN') ||
    hasRole('OWNER') ||
    hasPermission('valuation.read') ||
    hasPermission('billing.read');

  // Modal dialog state
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);

  // Queries
  const { data: product, isLoading, isFetching, isError, error, refetch } = useInventoryProduct(id);

  // 1. Loading State
  if (isLoading) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto" data-testid="inventory-detail-loading">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  // 2. Error / Not Found State
  if (isError || !product) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto" data-testid="inventory-detail-error">
        <Button asChild variant="ghost" size="sm">
          <Link to="/resources/inventory">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to Catalog
          </Link>
        </Button>

        <Card className="border-destructive/30 bg-destructive/5 text-center p-8">
          <CardContent className="space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                Product Not Found
              </h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                {error instanceof Error
                  ? error.message
                  : `Unable to find catalog product with identifier "${id}". It may have been removed or the ID is invalid.`}
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </Button>
              <Button asChild size="sm">
                <Link to="/resources/inventory">Return to Catalog</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isArchived = product.status === InventoryItemStatus.ARCHIVED;
  const isOutOfStock = product.isOutOfStock || product.currentStock === 0;
  const isLowStock = product.isLowStock && !isOutOfStock;

  const categoryDescriptor =
    INVENTORY_CATEGORY_REGISTRY[product.category]?.displayName ??
    product.category.replace(/_/g, ' ');

  const uomDescriptor =
    UNIT_OF_MEASURE_REGISTRY[product.unitOfMeasure as keyof typeof UNIT_OF_MEASURE_REGISTRY]
      ?.displayName ?? product.unitOfMeasure;

  return (
    <div className="space-y-6 max-w-5xl mx-auto" data-testid="inventory-detail-page">
      {/* Top Navigation & Operational Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Button asChild variant="ghost" size="sm" className="self-start gap-1">
          <Link to="/resources/inventory">
            <ArrowLeft className="h-4 w-4" /> Back to Catalog
          </Link>
        </Button>

        {/* Action Controls Bar */}
        <div className="flex flex-wrap items-center gap-2" data-testid="detail-actions-bar">
          {isFetching && !isLoading && (
            <Badge
              variant="outline"
              className="gap-1 text-[11px] text-muted-foreground animate-pulse"
            >
              <RefreshCw className="h-3 w-3 animate-spin" />
              Syncing...
            </Badge>
          )}

          {canWriteInventory && !isArchived && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => setReceiveDialogOpen(true)}
                data-testid="action-receive-stock"
              >
                <PackagePlus className="h-3.5 w-3.5 text-primary" />
                Receive Stock
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => setAdjustDialogOpen(true)}
                data-testid="action-adjust-stock"
              >
                <Scale className="h-3.5 w-3.5 text-primary" />
                Adjust Stock
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                asChild
                className="gap-1.5 text-xs"
                data-testid="action-edit-product"
              >
                <Link to={`/resources/inventory/${encodeURIComponent(product.id)}/edit`}>
                  <Edit className="h-3.5 w-3.5" />
                  Edit Details
                </Link>
              </Button>
            </>
          )}

          {canArchive && !isArchived && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs text-destructive hover:bg-destructive/10"
              onClick={() => setArchiveDialogOpen(true)}
              data-testid="action-archive-product"
            >
              <Archive className="h-3.5 w-3.5" />
              Archive
            </Button>
          )}
        </div>
      </div>

      {/* Product Hero Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-2 border-b border-border">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              {product.name}
            </h1>
            <InventoryStatusBadge status={product.status} />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="font-mono text-xs">
              SKU: {product.sku}
            </Badge>
            <span>•</span>
            <span className="font-medium text-foreground">{categoryDescriptor}</span>
            <span>•</span>
            <span>UOM: {uomDescriptor}</span>
          </div>
        </div>
      </div>

      {/* Low-Stock / Out-of-Stock Contextual Alert */}
      {isOutOfStock && (
        <Alert
          className="border-destructive/40 bg-destructive/10 text-destructive dark:bg-destructive/20"
          data-testid="status-out-of-stock-alert"
        >
          <AlertCircle className="h-5 w-5 text-destructive" />
          <AlertTitle className="font-semibold text-sm">Zero Physical Stock Available</AlertTitle>
          <AlertDescription className="text-xs mt-1 leading-relaxed">
            This consumable product is completely depleted on hand. Point-of-sale sales and
            treatment usages are blocked until replenishment receipt is recorded.
          </AlertDescription>
        </Alert>
      )}

      {isLowStock && (
        <Alert
          className="border-amber-400/50 bg-amber-50/70 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
          data-testid="status-low-stock-alert"
        >
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          <AlertTitle className="font-semibold text-sm">Low Stock Alert</AlertTitle>
          <AlertDescription className="text-xs mt-1 leading-relaxed">
            Current balance of {product.currentStock} {product.unitOfMeasure} is at or below the
            minimum reorder threshold of {product.reorderThreshold} {product.unitOfMeasure}.
            Replenishment purchase order recommended.
          </AlertDescription>
        </Alert>
      )}

      {/* Main Operational Hero Card: Stock Status & Balance */}
      <Card className="border-border bg-card shadow-sm" data-testid="stock-health-hero-card">
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 divide-y md:divide-y-0 md:divide-x divide-border">
            {/* 1. Physical Stock Balance */}
            <div className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Boxes className="h-4 w-4 text-primary" />
                Physical Stock on Hand
              </span>
              <div className="flex items-baseline gap-2 pt-1">
                <span
                  className={`text-3xl sm:text-4xl font-extrabold font-mono tracking-tight ${
                    isOutOfStock
                      ? 'text-destructive'
                      : isLowStock
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-foreground'
                  }`}
                  data-testid="current-stock-value"
                >
                  {product.currentStock}
                </span>
                <span className="text-sm font-medium text-muted-foreground">
                  {product.unitOfMeasure}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Authoritative on-hand quantity audited by chronological movements.
              </p>
            </div>

            {/* 2. Reorder Threshold Boundary */}
            <div className="space-y-1 pt-4 md:pt-0 md:pl-6">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Scale className="h-4 w-4 text-primary" />
                Minimum Reorder Threshold
              </span>
              <div className="flex items-baseline gap-2 pt-1">
                <span className="text-3xl sm:text-4xl font-extrabold font-mono tracking-tight text-foreground">
                  {product.reorderThreshold}
                </span>
                <span className="text-sm font-medium text-muted-foreground">
                  {product.unitOfMeasure} min
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Triggers restock alerts when balance is at or below this boundary.
              </p>
            </div>

            {/* 3. Stock Health Summary */}
            <div className="space-y-2 pt-4 md:pt-0 md:pl-6">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Operational Status
              </span>
              <div className="pt-1">
                {isOutOfStock ? (
                  <Badge variant="destructive" className="text-xs py-1 px-2.5">
                    Depleted (0 on hand)
                  </Badge>
                ) : isLowStock ? (
                  <Badge
                    variant="outline"
                    className="border-amber-500 text-amber-600 dark:text-amber-400 text-xs py-1 px-2.5"
                  >
                    Below Reorder Point
                  </Badge>
                ) : (
                  <Badge
                    variant="secondary"
                    className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-xs py-1 px-2.5"
                  >
                    Adequate Stock Balance
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {product.status === InventoryItemStatus.ARCHIVED
                  ? 'Archived catalog item (inactive).'
                  : 'Active item available for gym operations.'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Two-Column Information Layout: Commercial Details & Metadata */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Commercial Pricing & Capital Valuation */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              Commercial Pricing & Valuation
            </CardTitle>
            <CardDescription className="text-xs">
              Retail pricing for POS and unit acquisition cost for balance sheet capital.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg bg-muted/40 border space-y-1">
                <span className="text-xs font-semibold text-muted-foreground">
                  Retail Selling Price
                </span>
                <div className="text-xl font-bold font-mono text-foreground">
                  ${product.sellingPrice.amount.toFixed(2)}{' '}
                  <span className="text-xs font-normal text-muted-foreground font-sans">
                    {product.sellingPrice.currency}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">Gym retail POS price</p>
              </div>

              <div
                className="p-3 rounded-lg bg-muted/40 border space-y-1"
                data-testid="unit-cost-container"
              >
                <span className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
                  Purchase Unit Cost
                  {!canViewCost && <Lock className="h-3 w-3 text-muted-foreground" />}
                </span>
                {canViewCost ? (
                  <div className="text-xl font-bold font-mono text-foreground">
                    ${product.unitCost.amount.toFixed(2)}{' '}
                    <span className="text-xs font-normal text-muted-foreground font-sans">
                      {product.unitCost.currency}
                    </span>
                  </div>
                ) : (
                  <div className="text-sm font-mono text-muted-foreground pt-1">
                    ••••••{' '}
                    <span className="text-[10px] text-muted-foreground font-sans block">
                      Restricted (valuation.read)
                    </span>
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">Acquisition cost per unit</p>
              </div>
            </div>

            {canViewCost && (
              <div className="p-3 rounded-md bg-muted/20 border text-xs flex items-center justify-between">
                <span className="text-muted-foreground">Current Working Capital Value:</span>
                <span className="font-mono font-bold text-foreground">
                  ${(product.currentStock * product.unitCost.amount).toFixed(2)}{' '}
                  {product.unitCost.currency}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Catalog Identification & Metadata */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              Catalog Specifications & Timestamps
            </CardTitle>
            <CardDescription className="text-xs">
              System identifiers, classification taxonomy, and lifecycle timestamps.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="flex items-start justify-between py-1 border-b border-border/60">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                Taxonomy Category
              </span>
              <span className="font-medium text-foreground">{categoryDescriptor}</span>
            </div>

            <div className="flex items-start justify-between py-1 border-b border-border/60">
              <span className="text-muted-foreground">Unit of Measure (UOM)</span>
              <span className="font-medium text-foreground">{uomDescriptor}</span>
            </div>

            <div className="flex items-start justify-between py-1 border-b border-border/60">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                Created Timestamp
              </span>
              <span className="font-mono text-muted-foreground">
                {new Date(product.createdAt).toLocaleString()}
              </span>
            </div>

            <div className="flex items-start justify-between py-1 border-b border-border/60">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                Last Ledger Modification
              </span>
              <span className="font-mono text-muted-foreground">
                {new Date(product.updatedAt).toLocaleString()}
              </span>
            </div>

            {product.description && (
              <div className="pt-2">
                <span className="text-muted-foreground block font-medium mb-1">Description</span>
                <p className="text-foreground leading-relaxed bg-muted/40 p-2.5 rounded-md border text-xs">
                  {product.description}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Chronological Recent Movements Ledger Preview */}
      <ProductMovementsPreview
        productId={product.id}
        unitOfMeasure={product.unitOfMeasure}
        onViewAll={() => {
          // Future full movement view tab or navigation
        }}
      />

      {/* Authorized Modal Dialog Workflows */}
      <ReceiveStockDialog
        product={product}
        open={receiveDialogOpen}
        onOpenChange={setReceiveDialogOpen}
        onSuccess={() => refetch()}
      />

      <AdjustStockDialog
        product={product}
        open={adjustDialogOpen}
        onOpenChange={setAdjustDialogOpen}
        onSuccess={() => refetch()}
      />

      <ArchiveProductDialog
        product={product}
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        onArchived={() => {
          navigate('/resources/inventory');
        }}
      />
    </div>
  );
};
