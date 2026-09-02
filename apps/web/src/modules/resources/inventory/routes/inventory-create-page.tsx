import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Badge } from '@kinergy-platform/ui';
import { ArrowLeft, PackagePlus } from 'lucide-react';
import { useCreateProduct } from '../hooks';
import { ProductCreateForm } from '../components/product-create-form';
import type { CreateProductInputVM } from '../types';

export const InventoryCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const { mutate: createProduct, isPending, error } = useCreateProduct();

  const handleSubmit = (data: CreateProductInputVM) => {
    createProduct(data, {
      onSuccess: (newItem) => {
        if (newItem?.id) {
          navigate(`/resources/inventory/${newItem.id}`);
        } else {
          navigate('/resources/inventory');
        }
      },
    });
  };

  const handleCancel = () => {
    navigate('/resources/inventory');
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* 1. Header Navigation & Breadcrumb */}
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to="/resources/inventory">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to Catalog
          </Link>
        </Button>
        <Badge variant="outline">Milestone 6.12 Form</Badge>
      </div>

      {/* 2. Page Title Block */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <PackagePlus className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Register Consumable Product
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Define catalog identification, commercial pricing, reorder thresholds, and opening
          physical balances.
        </p>
      </div>

      {/* 3. Product Registration Form */}
      <ProductCreateForm
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isSubmitting={isPending}
        serverError={error}
      />
    </div>
  );
};
