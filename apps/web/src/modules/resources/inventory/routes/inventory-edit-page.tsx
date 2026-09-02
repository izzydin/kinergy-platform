import React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Badge, Skeleton, Card, CardContent } from '@kinergy-platform/ui';
import { ArrowLeft, PackageCheck, AlertCircle, RefreshCw } from 'lucide-react';
import { useInventoryProduct } from '../hooks';
import { useUpdateProduct } from '../hooks';
import { ProductEditForm } from '../components/product-edit-form';
import type { UpdateProductInputVM } from '../types';

export const InventoryEditPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: product, isLoading, isError, error: fetchError, refetch } = useInventoryProduct(id);

  const { mutate: updateProduct, isPending: isUpdating, error: updateError } = useUpdateProduct();

  const handleSubmit = (payload: UpdateProductInputVM) => {
    if (!id) return;

    updateProduct(
      { id, payload },
      {
        onSuccess: (updated) => {
          navigate(`/resources/inventory/${encodeURIComponent(updated.id)}`);
        },
      },
    );
  };

  const handleCancel = () => {
    if (id) {
      navigate(`/resources/inventory/${encodeURIComponent(id)}`);
    } else {
      navigate('/resources/inventory');
    }
  };

  const handleArchived = () => {
    navigate('/resources/inventory');
  };

  // 1. Loading State Skeleton
  if (isLoading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto" data-testid="inventory-edit-loading">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-6 w-24" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Card>
          <CardContent className="p-6 space-y-6">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // 2. Error / Not Found State
  if (isError || !product) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto" data-testid="inventory-edit-error">
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
                {fetchError instanceof Error
                  ? fetchError.message
                  : `Unable to find catalog product with identifier "${id}". It may have been deleted or the identifier is invalid.`}
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

  // 3. Product Loaded & Ready for Edit
  return (
    <div className="space-y-6 max-w-4xl mx-auto" data-testid="inventory-edit-page">
      {/* Navigation & Context Badge */}
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to={`/resources/inventory/${encodeURIComponent(product.id)}`}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to Product
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs">
            {product.sku}
          </Badge>
          <Badge variant="secondary">Milestone 6.12 Edit</Badge>
        </div>
      </div>

      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <PackageCheck className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Edit {product.name}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Update catalog metadata, commercial pricing, and reorder warning triggers.
        </p>
      </div>

      {/* Edit Form */}
      <ProductEditForm
        product={product}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isSubmitting={isUpdating}
        serverError={updateError}
        onArchived={handleArchived}
      />
    </div>
  );
};
