import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Badge } from '@kinergy-platform/ui';
import { ArrowLeft, PlusCircle } from 'lucide-react';
import { useCreateAsset } from '../hooks';
import { AssetCreateForm } from '../components/asset-create-form';
import type { CreateFixedAssetInputVM } from '../types';

export const AssetCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const { mutate: createAsset, isPending, error } = useCreateAsset();

  const handleSubmit = (data: CreateFixedAssetInputVM) => {
    createAsset(data, {
      onSuccess: (newAsset) => {
        if (newAsset?.id) {
          navigate(`/resources/assets/${newAsset.id}`);
        } else {
          navigate('/resources/assets');
        }
      },
    });
  };

  const handleCancel = () => {
    navigate('/resources/assets');
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto" data-testid="asset-create-page">
      {/* 1. Header Navigation & Breadcrumb */}
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to="/resources/assets">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to Catalog
          </Link>
        </Button>
        <Badge variant="outline">Commissioning Workflow</Badge>
      </div>

      {/* 2. Page Title Block */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <PlusCircle className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Commission New Fixed Asset
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Register new capital equipment into the enterprise estate, assign initial physical
          location, and record invoice acquisition valuation.
        </p>
      </div>

      {/* 3. Asset Registration Form */}
      <AssetCreateForm
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isSubmitting={isPending}
        serverError={error}
      />
    </div>
  );
};
