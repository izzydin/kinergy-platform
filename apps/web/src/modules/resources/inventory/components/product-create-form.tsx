import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  InventoryCategory,
  UnitOfMeasure,
  INVENTORY_CATEGORY_REGISTRY,
  UNIT_OF_MEASURE_REGISTRY,
} from '@kinergy-platform/core';
import { Input, Card, CardContent } from '@kinergy-platform/ui';
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
import { createProductSchema, type CreateProductFormData } from '../schemas';
import type { CreateProductInputVM } from '../types';

export interface ProductCreateFormProps {
  /**
   * Submission handler callback.
   * Receives strongly validated CreateProductInputVM.
   */
  onSubmit: (data: CreateProductInputVM) => Promise<void> | void;
  /**
   * Cancellation handler callback.
   */
  onCancel?: () => void;
  /**
   * Whether the submission mutation is pending.
   */
  isSubmitting?: boolean;
  /**
   * Optional server error object to apply to fields.
   */
  serverError?: Error | null;
}

export const ProductCreateForm: React.FC<ProductCreateFormProps> = ({
  onSubmit,
  onCancel,
  isSubmitting = false,
  serverError,
}) => {
  const form = useForm<CreateProductFormData>({
    resolver: zodResolver(createProductSchema),
    defaultValues: {
      sku: '',
      name: '',
      description: '',
      category: InventoryCategory.SUPPLEMENTS,
      unitCost: 0,
      sellingPrice: 0,
      quantityOnHand: 0,
      reorderThreshold: 5,
      unitOfMeasure: UnitOfMeasure.UNITS,
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

  // Dirty guard intercepts internal navigation and beforeunload when edits are unsaved
  const {
    isBlocked,
    proceed,
    reset: cancelDiscard,
  } = useDirtyGuard({
    isDirty,
    isSubmitSuccessful,
  });

  // Server error application hook
  const applyServerErrors = useApplyServerErrors(setError);

  React.useEffect(() => {
    if (serverError instanceof ValidationError) {
      applyServerErrors(serverError, { fallbackField: 'sku' });
    } else if (serverError) {
      setError('sku', { message: serverError.message });
    }
  }, [serverError, applyServerErrors, setError]);

  const handleFormSubmit = (values: CreateProductFormData) => {
    onSubmit({
      sku: values.sku.trim().toUpperCase(),
      name: values.name.trim(),
      description: values.description?.trim() || undefined,
      category: values.category,
      unitCost: values.unitCost,
      sellingPrice: values.sellingPrice,
      quantityOnHand: values.quantityOnHand,
      reorderThreshold: values.reorderThreshold,
      unitOfMeasure: values.unitOfMeasure,
    });
  };

  const handleCancelClick = () => {
    if (onCancel) {
      onCancel();
    }
  };

  return (
    <>
      <Card className="border-border bg-card">
        <CardContent className="p-6">
          <Form {...form}>
            <form
              onSubmit={handleSubmit(handleFormSubmit)}
              noValidate
              aria-label="Register Product Form"
            >
              <FormLayout variant="page">
                {/* Global validation summary alert when submitted with errors */}
                <FormValidationSummary errors={errors} />

                {/* Section 1: Identification & Classification */}
                <FormSection
                  title="Identification & Classification"
                  description="Primary identifiers and taxonomy for this consumable item."
                >
                  <FormFieldGroup columns={2}>
                    {/* SKU Field */}
                    <FormField
                      control={control}
                      name="sku"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>Stock Keeping Unit (SKU)</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g. PROT-WHEY-1KG"
                              autoCapitalize="characters"
                              className="font-mono uppercase"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                            />
                          </FormControl>
                          <FormDescription>
                            Unique code using letters, numbers, hyphens, and underscores (min 3
                            chars).
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Product Name Field */}
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
                            Determines operational handling and retail eligibility.
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
                            Counting standard for stock tracking and point-of-sale.
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

                {/* Section 2: Commercial Pricing & Valuation */}
                <FormSection
                  title="Pricing & Valuation"
                  description="Unit acquisition costs for working capital valuation and public retail pricing."
                  withSeparator
                >
                  <FormFieldGroup columns={2}>
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
                          <FormDescription>
                            Acquisition cost per unit. Used for authoritative valuation
                            calculations.
                          </FormDescription>
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
                          <FormDescription>
                            Default retail price for gym point-of-sale before member discounts.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </FormFieldGroup>
                </FormSection>

                {/* Section 3: Stock Management & Invariants */}
                <FormSection
                  title="Stock Tracking & Thresholds"
                  description="Reorder triggers and initial physical opening stock balances."
                  withSeparator
                >
                  <FormFieldGroup columns={2}>
                    {/* Minimum Reorder Threshold */}
                    <FormField
                      control={control}
                      name="reorderThreshold"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>Reorder Threshold Quantity</FormLabel>
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
                          <FormDescription>
                            Triggers low-stock alerts when physical inventory reaches or falls below
                            this count.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Initial Opening Stock */}
                    <FormField
                      control={control}
                      name="quantityOnHand"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>Initial Opening Stock</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="1"
                              min="0"
                              placeholder="0"
                              {...field}
                              value={field.value ?? ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                field.onChange(val === '' ? undefined : parseInt(val, 10));
                              }}
                            />
                          </FormControl>
                          <FormDescription>
                            Physical stock on hand at creation. Recorded through an opening balance
                            audit movement.
                          </FormDescription>
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
                  <FormSubmitButton isSubmitting={isSubmitting}>Register Product</FormSubmitButton>
                </FormActions>
              </FormLayout>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Discard confirmation dialog if user navigates away with unsaved edits */}
      <ConfirmDiscardDialog
        open={isBlocked}
        onConfirm={proceed}
        onCancel={cancelDiscard}
        title="Discard unsaved product data?"
        description="You have entered uncommitted product information. Leaving this page now will discard your entries."
      />
    </>
  );
};
