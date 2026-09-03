import React from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Button, Badge, Skeleton, Card, CardContent } from '@kinergy-platform/ui';
import { ArrowLeft, Edit3, AlertCircle, RefreshCw } from 'lucide-react';
import { useAsset, useUpdateAssetDetails } from '../hooks';
import { AssetEditForm } from '../components/asset-edit-form';
import type { UpdateFixedAssetDetailsInputVM } from '../types';

export const AssetEditPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: asset, isLoading, isError, error: fetchError, refetch } = useAsset(id);
  const {
    mutate: updateDetails,
    isPending: isUpdating,
    error: updateError,
  } = useUpdateAssetDetails();

  const handleSubmit = (payload: UpdateFixedAssetDetailsInputVM) => {
    if (!id) return;

    updateDetails(
      { id, payload },
      {
        onSuccess: (updated) => {
          navigate(`/resources/assets/${encodeURIComponent(updated.id)}`);
        },
      },
    );
  };

  const handleCancel = () => {
    if (id) {
      navigate(`/resources/assets/${encodeURIComponent(id)}`);
    } else {
      navigate('/resources/assets');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto" data-testid="asset-edit-page">
      {/* 1. Header Navigation & Breadcrumb */}
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to={id ? `/resources/assets/${encodeURIComponent(id)}` : '/resources/assets'}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to Asset Overview
          </Link>
        </Button>
        <Badge variant="outline">Descriptive Metadata</Badge>
      </div>

      {/* 2. Page Title Block */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Edit3 className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Edit Asset Details: {id}
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Update descriptive metadata and notes. Status, location, and condition are updated via
          dedicated operations.
        </p>
      </div>

      {/* 3. Conditional Content: Loading, Error, or Form */}
      {isLoading && (
        <div className="space-y-6" data-testid="asset-edit-loading">
          <Card>
            <CardContent className="p-6 space-y-6">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-24 w-full" />
            </CardContent>
          </Card>
        </div>
      )}

      {isError && (
        <div data-testid="asset-edit-error">
          <Card className="border-destructive/30 bg-destructive/5 text-center p-8">
            <CardContent className="space-y-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-bold tracking-tight text-foreground">
                  Asset Not Found
                </h2>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  {fetchError instanceof Error
                    ? fetchError.message
                    : `Unable to find fixed asset with identifier "${id}". It may have been decommissioned or the identifier is invalid.`}
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  <RefreshCw className="mr-1.5 h-4 w-4" /> Try Again
                </Button>
                <Button asChild size="sm">
                  <Link to="/resources/assets">View All Assets</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {!isLoading && !isError && asset && (
        <AssetEditForm
          asset={asset}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          isSubmitting={isUpdating}
          serverError={updateError}
        />
      )}
    </div>
  );
};
