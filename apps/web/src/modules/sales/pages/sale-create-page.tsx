import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardHeader, CardTitle, Button, Input } from '@kinergy-platform/ui';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';
import { createSaleSchema, type CreateSaleFormData } from '../schemas/create-sale.schema';
import { useCreateSale } from '../hooks/use-sales-mutations';
import { VALID_SALE_SOURCE_TYPES } from '../types/sales.types';

export const SaleCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const createSaleMutation = useCreateSale();

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateSaleFormData>({
    resolver: zodResolver(createSaleSchema),
    defaultValues: {
      currency: 'USD',
      clientId: '',
      items: [
        {
          sourceType: 'INVENTORY_ITEM',
          sourceId: 'inv_item_default',
          description: 'Standard Item',
          unitPrice: 10.0,
          quantity: 1,
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  });

  const onSubmit = async (data: CreateSaleFormData) => {
    const idempotencyKey = `sale_create_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const created = await createSaleMutation.mutateAsync({
      input: {
        currency: data.currency,
        clientId: data.clientId?.trim() || undefined,
        sourceReference: data.sourceReference,
        items: data.items,
        orderDiscount: data.orderDiscount,
      },
      idempotencyKey,
    });
    navigate(`/sales/${created.id}`);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto" data-testid="sale-create-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/sales/list">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Create Commercial Sale</h1>
            <p className="text-sm text-muted-foreground">
              Initialize a checkout session in DRAFT status.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Customer & General Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Order Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="clientId" className="text-sm font-medium">
                  Client ID (Optional / Leave empty for Walk-in)
                </label>
                <Input
                  id="clientId"
                  placeholder="e.g. cli_01j9876543210"
                  {...register('clientId')}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="currency" className="text-sm font-medium">
                  Currency (ISO-4217)
                </label>
                <Input
                  id="currency"
                  defaultValue="USD"
                  maxLength={3}
                  {...register('currency')}
                  className="font-mono uppercase"
                />
                {errors.currency && (
                  <p className="text-xs text-destructive">{errors.currency.message}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Line Items */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Line Items</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                append({
                  sourceType: 'INVENTORY_ITEM',
                  sourceId: `item_${Date.now()}`,
                  description: '',
                  unitPrice: 0.0,
                  quantity: 1,
                })
              }
              className="text-xs gap-1"
            >
              <Plus className="h-3.5 w-3.5" /> Add Line Item
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {fields.map((field, index) => (
              <div
                key={field.id}
                className="p-4 border border-border rounded-md bg-muted/20 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">
                    Item #{index + 1}
                  </span>
                  {fields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(index)}
                      className="h-7 text-xs text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Category</label>
                    <select
                      {...register(`items.${index}.sourceType` as const)}
                      className="w-full h-9 rounded-md border border-input bg-background px-2 text-xs"
                    >
                      {VALID_SALE_SOURCE_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium">Item Description</label>
                    <Input
                      placeholder="Product or service name"
                      {...register(`items.${index}.description` as const)}
                      className="h-9 text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium">Unit Price</label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      {...register(`items.${index}.unitPrice` as const, { valueAsNumber: true })}
                      className="h-9 text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium">Quantity</label>
                    <Input
                      type="number"
                      min={1}
                      defaultValue={1}
                      {...register(`items.${index}.quantity` as const, { valueAsNumber: true })}
                      className="h-9 text-xs"
                    />
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Submit Actions */}
        <div className="flex items-center justify-end gap-3">
          <Button asChild variant="outline">
            <Link to="/sales/list">Cancel</Link>
          </Button>
          <Button type="submit" disabled={createSaleMutation.isPending}>
            {createSaleMutation.isPending ? 'Initializing Sale...' : 'Initialize Draft Sale'}
          </Button>
        </div>
      </form>
    </div>
  );
};
