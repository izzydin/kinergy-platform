import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import {
  InventoryCategory,
  UnitOfMeasure,
  INVENTORY_CATEGORY_REGISTRY,
  UNIT_OF_MEASURE_REGISTRY,
  InventoryItemStatus,
} from '@kinergy-platform/core';
import {
  Input,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Badge,
  Button,
} from '@kinergy-platform/ui';
import { Lock, Boxes, ArrowRight, Archive, AlertTriangle, ShieldCheck } from 'lucide-react';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormValidationSummary,
  FormLayout,
  FormSection,
  FormFieldGroup,
  FormActions,
  FormSubmitButton,
  FormCancelButton,
  FormResetButton,
  ConfirmDiscardDialog,
  useDirtyGuard,
  useApplyServerErrors,
} from '../../../../shared/forms';
import { ValidationError } from '../../../../shared/query';
import { editProductFormSchema, type EditProductFormData } from '../schemas';
import type { InventoryProductVM, UpdateProductInputVM } from '../types';
import { InventoryStatusBadge } from './inventory-status-badge';
import { ArchiveProductDialog } from './archive-product-dialog';

export interface ProductEditFormProps {
  /**
   * Authoritative product entity loaded from backend.
   */
  readonly product: InventoryProductVM;
  /**
   * Update submission handler.
   */
  readonly onSubmit: (data: UpdateProductInputVM) => void;
  /**
   * Cancellation handler callback.
   */
  readonly onCancel?: () => void;
  /**
   * Whether update mutation is pending.
   */
  readonly isSubmitting?: boolean;
  /**
   * Optional server error.
   */
  readonly serverError?: Error | null;
  /**
   * Optional callback when product is archived.
   */
  readonly onArchived?: () => void;
}

export const ProductEditForm: React.FC<ProductEditFormProps> = ({
  product,
  onSubmit,
  onCancel,
  isSubmitting = false,
  serverError,
  onArchived,
}) => {
  const [archiveDialogOpen, setArchiveDialogOpen] = React.useState(false);

  const form = useForm<EditProductFormData>({
    resolver: zodResolver(editProductFormSchema),
    defaultValues: {
      name: product.name,
      description: product.description ?? '',
      category: product.category,
      unitOfMeasure: (product.unitOfMeasure as UnitOfMeasure) ?? UnitOfMeasure.UNITS,
      unitCost: product.unitCost.amount,
      sellingPrice: product.sellingPrice.amount,
      reorderThreshold: product.reorderThreshold,
    },
    mode: 'onTouched',
  });

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { isDirty, isSubmitSuccessful, errors },
  } = form;

  // Hydrate form whenever authoritative server entity updates
  React.useEffect(() => {
    reset({
      name: product.name,
      description: product.description ?? '',
      category: product.category,
      unitOfMeasure: (product.unitOfMeasure as UnitOfMeasure) ?? UnitOfMeasure.UNITS,
      unitCost: product.unitCost.amount,
      sellingPrice: product.sellingPrice.amount,
      reorderThreshold: product.reorderThreshold,
    });
  }, [product, reset]);

  const [isNavigatingPostSubmit, setIsNavigatingPostSubmit] = React.useState(false);

  // Dirty state navigation guard
  const {
    isBlocked,
    proceed,
    reset: cancelDiscard,
  } = useDirtyGuard({
    isDirty: isDirty && !isNavigatingPostSubmit,
    isSubmitSuccessful: isSubmitSuccessful || isNavigatingPostSubmit,
    enabled: !isNavigatingPostSubmit,
  });

  // Auto-proceed if blocked during authorized post-submit navigation
  React.useEffect(() => {
    if (isBlocked && isNavigatingPostSubmit) {
      proceed();
    }
  }, [isBlocked, isNavigatingPostSubmit, proceed]);

  // Server error application hook
  const applyServerErrors = useApplyServerErrors(setError);

  React.useEffect(() => {
    if (serverError) {
      setIsNavigatingPostSubmit(false);
      if (serverError instanceof ValidationError) {
        applyServerErrors(serverError, { fallbackField: 'name' });
      } else {
        setError('name', { message: serverError.message });
      }
    }
  }, [serverError, applyServerErrors, setError]);

  const handleFormSubmit = (values: EditProductFormData) => {
    setIsNavigatingPostSubmit(true);
    onSubmit({
      name: values.name.trim(),
      description: values.description?.trim() || undefined,
      category: values.category,
      unitOfMeasure: values.unitOfMeasure,
      unitCost: values.unitCost,
      sellingPrice: values.sellingPrice,
      reorderThreshold: values.reorderThreshold,
    });
  };

  const handleCancelClick = () => {
    if (onCancel) {
      onCancel();
    }
  };

  const isArchived = product.status === InventoryItemStatus.ARCHIVED;

  return (
    <div className="space-y-6">
      <Card className="border-border bg-card">
        <CardContent className="p-6">
          <Form {...form}>
            <form
              onSubmit={handleSubmit(handleFormSubmit)}
              noValidate
              aria-label="Edit Product Form"
            >
              <FormLayout variant="page">
                {/* Global error alert */}
                <FormValidationSummary errors={errors} />

                {/* Section 1: Identification & Taxonomy */}
                <FormSection
                  title="Identification & Taxonomy"
                  description="Immutable catalog identifiers and descriptive information."
                >
                  <FormFieldGroup columns={2}>
                    {/* Immutable SKU Field (Read-only display) */}
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-1.5 text-sm font-medium leading-none text-foreground select-none">
                        <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                        Stock Keeping Unit (SKU)
                        <Badge variant="secondary" className="ml-1 text-[10px] py-0 px-1.5">
                          Immutable
                        </Badge>
                      </label>
                      <div className="flex items-center h-10 w-full rounded-md border border-input bg-muted/60 px-3 py-2 text-sm font-mono font-medium text-foreground select-all">
                        {product.sku}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Authoritative ledger code established at registration. Cannot be modified.
                      </p>
                    </div>

                    {/* Product Name Field (Editable) */}
                    <FormField
                      control={control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>Product Name</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Grass-Fed Whey Isolate 1kg" {...field} />
                          </FormControl>
                          <FormDescription>
                            Official commercial display name (3-120 characters).
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </FormFieldGroup>

                  <FormFieldGroup columns={2}>
                    {/* Category Classification */}
                    <FormField
                      control={control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>Taxonomy Category</FormLabel>
                          <FormControl>
                            <select
                              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                              {...field}
                            >
                              {Object.values(InventoryCategory).map((cat) => (
                                <option key={cat} value={cat}>
                                  {INVENTORY_CATEGORY_REGISTRY[cat]?.displayName ??
                                    cat.replace(/_/g, ' ')}
                                </option>
                              ))}
                            </select>
                          </FormControl>
                          <FormDescription>
                            Determines operational handling and retail classification.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Unit of Measure */}
                    <FormField
                      control={control}
                      name="unitOfMeasure"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>Unit of Measure (UOM)</FormLabel>
                          <FormControl>
                            <select
                              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                              {...field}
                            >
                              {Object.values(UnitOfMeasure).map((uom) => (
                                <option key={uom} value={uom}>
                                  {UNIT_OF_MEASURE_REGISTRY[uom]?.displayName ?? uom}
                                </option>
                              ))}
                            </select>
                          </FormControl>
                          <FormDescription>
                            Discrete counting metric for stock tracking and point-of-sale.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </FormFieldGroup>

                  {/* Description Field */}
                  <FormField
                    control={control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Product Description</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Optional product details, ingredients, or storage instructions"
                            {...field}
                            value={field.value ?? ''}
                          />
                        </FormControl>
                        <FormDescription>
                          Internal operational or client notes (max 500 characters).
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </FormSection>

                {/* Section 2: Authoritative Stock Audit Rule Callout */}
                <div
                  className="rounded-lg border border-border/80 bg-muted/40 p-4 space-y-3"
                  data-testid="stock-ledger-audit-banner"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Boxes className="h-5 w-5 text-primary" />
                      <h4 className="text-sm font-semibold text-foreground">
                        Physical Stock on Hand
                      </h4>
                    </div>
                    <InventoryStatusBadge status={product.status} />
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold tracking-tight text-foreground font-mono">
                        {product.currentStock}
                      </span>
                      <span className="text-sm text-muted-foreground font-medium">
                        {product.unitOfMeasure} available
                      </span>
                      {product.isLowStock && (
                        <Badge variant="destructive" className="ml-2 text-xs">
                          Low Stock
                        </Badge>
                      )}
                    </div>

                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="gap-1.5 self-start sm:self-auto"
                    >
                      <Link to={`/resources/inventory/${encodeURIComponent(product.id)}`}>
                        Record Stock Movement
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <ShieldCheck className="inline h-3.5 w-3.5 text-primary mr-1 -mt-0.5" />
                    <strong>Ledger Integrity Invariant:</strong> Physical inventory cannot be
                    directly overwritten through metadata editing. All stock changes require an
                    authoritative movement entry (Receive, Sell, Adjust, or Scrap) to maintain a
                    verifiable audit trail.
                  </p>
                </div>

                {/* Section 3: Commercial Pricing & Thresholds */}
                <FormSection
                  title="Pricing & Reorder Thresholds"
                  description="Unit acquisition costs for capital valuation and low-stock warning triggers."
                  withSeparator
                >
                  <FormFieldGroup columns={3}>
                    {/* Unit Acquisition Cost */}
                    <FormField
                      control={control}
                      name="unitCost"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>Unit Purchase Cost ($)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              {...field}
                              value={field.value ?? ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                field.onChange(val === '' ? undefined : Number(val));
                              }}
                            />
                          </FormControl>
                          <FormDescription>Acquisition cost used for valuation.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Retail Selling Price */}
                    <FormField
                      control={control}
                      name="sellingPrice"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>Retail Selling Price ($)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              {...field}
                              value={field.value ?? ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                field.onChange(val === '' ? undefined : Number(val));
                              }}
                            />
                          </FormControl>
                          <FormDescription>Public gym point-of-sale retail price.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Minimum Reorder Threshold */}
                    <FormField
                      control={control}
                      name="reorderThreshold"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>Reorder Threshold</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="1"
                              min="0"
                              placeholder="5"
                              {...field}
                              value={field.value ?? ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                field.onChange(val === '' ? undefined : parseInt(val, 10));
                              }}
                            />
                          </FormControl>
                          <FormDescription>Low-stock alert boundary.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </FormFieldGroup>
                </FormSection>

                {/* Form Action Buttons */}
                <FormActions align="end">
                  <FormCancelButton onCancel={handleCancelClick} disabled={isSubmitting}>
                    Cancel
                  </FormCancelButton>
                  <FormResetButton onReset={() => reset()} disabled={isSubmitting || !isDirty}>
                    Reset
                  </FormResetButton>
                  <FormSubmitButton isSubmitting={isSubmitting}>Save Changes</FormSubmitButton>
                </FormActions>
              </FormLayout>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Danger Zone: Lifecycle Archive Actions */}
      <Card className="border-destructive/30 bg-destructive/5">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base text-destructive flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" />
                Product Lifecycle Operations
              </CardTitle>
              <CardDescription>Manage product availability and catalog archival.</CardDescription>
            </div>
            {!isArchived ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="gap-1.5"
                onClick={() => setArchiveDialogOpen(true)}
              >
                <Archive className="h-4 w-4" />
                Archive Product
              </Button>
            ) : (
              <Badge variant="outline" className="text-muted-foreground border-border">
                Archived Product
              </Badge>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Discard confirmation dialog */}
      <ConfirmDiscardDialog
        open={isBlocked}
        onConfirm={proceed}
        onCancel={cancelDiscard}
        title="Discard unsaved changes?"
        description="You have modified product details. Leaving now will discard your unsaved changes."
      />

      {/* Archive confirmation dialog */}
      <ArchiveProductDialog
        product={product}
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        onArchived={onArchived}
      />
    </div>
  );
};
