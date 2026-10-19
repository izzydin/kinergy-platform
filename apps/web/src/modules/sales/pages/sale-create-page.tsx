import React, { useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Badge,
} from '@kinergy-platform/ui';
import {
  Plus,
  Trash2,
  ArrowLeft,
  AlertCircle,
  ShieldAlert,
  Info,
  ShoppingBag,
  Percent,
  Tag,
} from 'lucide-react';
import { createSaleSchema, type CreateSaleFormData } from '../schemas/create-sale.schema';
import { useCreateSale } from '../hooks/use-sales-mutations';
import { VALID_SALE_SOURCE_TYPES } from '../types/sales.types';
import { useAuth } from '../../../app/providers/auth-provider';
import { ForbiddenView } from '../../../app/routes/fallback-views';
import { SALES_ROUTES } from '../routes/sales-routes';
import { useDirtyGuard, ConfirmDiscardDialog, useApplyServerErrors } from '../../../shared/forms';
import { ValidationError } from '../../../shared/query';

export const SaleCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const createSaleMutation = useCreateSale();

  // Permission check: sales.create
  const canCreate = Boolean(
    typeof auth.hasPermission === 'function'
      ? auth.hasPermission('sales.create')
      : auth.currentUser?.permissions?.includes('sales.create'),
  );

  const [hasSourceReference, setHasSourceReference] = useState(false);
  const [hasOrderDiscount, setHasOrderDiscount] = useState(false);
  const [isNavigatingPostSubmit, setIsNavigatingPostSubmit] = useState(false);
  const [serverError, setServerError] = useState<{
    status?: number;
    message: string;
    isConflict?: boolean;
    isAmbiguous?: boolean;
  } | null>(null);

  // Stable client idempotency key initialized once per form session
  const [idempotencyKey] = useState(
    () => `sale_init_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
  );

  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting, isDirty, isSubmitSuccessful },
  } = useForm<CreateSaleFormData>({
    resolver: zodResolver(createSaleSchema),
    defaultValues: {
      currency: 'USD',
      clientId: '',
      hasSourceReference: false,
      sourceReference: {
        type: 'INVENTORY_ITEM',
        referenceId: '',
        referenceCode: '',
      },
      items: [
        {
          sourceType: 'INVENTORY_ITEM',
          sourceId: 'item_1',
          description: '',
          skuOrCode: '',
          unitPrice: 0.0,
          quantity: 1,
        },
      ],
      orderDiscount: undefined,
    },
  });

  const {
    isBlocked,
    proceed,
    reset: resetDirtyGuard,
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

  const applyServerErrors = useApplyServerErrors<CreateSaleFormData>(setError);

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  });

  const watchedItems = useWatch({ control, name: 'items' }) || [];
  const watchedOrderDiscount = useWatch({ control, name: 'orderDiscount' });
  const watchedCurrency = useWatch({ control, name: 'currency' }) || 'USD';

  // Client preview calculation (Explicitly non-authoritative)
  const previewTotals = useMemo(() => {
    let subtotal = 0;
    for (const item of watchedItems) {
      const numQ = Number(item?.quantity);
      const q = !isNaN(numQ) && numQ > 0 ? numQ : 0;
      const numP = Number(item?.unitPrice);
      const p = !isNaN(numP) && numP >= 0 ? numP : 0;
      subtotal += q * p;
    }

    let discountTotal = 0;
    if (hasOrderDiscount && watchedOrderDiscount?.value) {
      const discVal = Number(watchedOrderDiscount.value);
      if (!isNaN(discVal) && discVal > 0) {
        if (watchedOrderDiscount.type === 'PERCENTAGE') {
          discountTotal = (subtotal * Math.min(100, Math.max(0, discVal))) / 100;
        } else {
          discountTotal = Math.min(subtotal, Math.max(0, discVal));
        }
      }
    }

    const total = Math.max(0, subtotal - discountTotal);
    return { subtotal, discountTotal, total };
  }, [watchedItems, hasOrderDiscount, watchedOrderDiscount]);

  if (!canCreate) {
    return (
      <ForbiddenView message="Access Denied: Missing required permission 'sales.create' to initialize sales agreements." />
    );
  }

  const onSubmit = async (data: CreateSaleFormData) => {
    if (createSaleMutation.isPending || isSubmitting) return;
    setServerError(null);

    try {
      const payloadSourceReference =
        hasSourceReference && data.sourceReference?.referenceId?.trim()
          ? {
              type: data.sourceReference.type.trim(),
              referenceId: data.sourceReference.referenceId.trim(),
              referenceCode: data.sourceReference.referenceCode?.trim() || undefined,
            }
          : undefined;

      const created = await createSaleMutation.mutateAsync({
        input: {
          currency: data.currency.trim().toUpperCase(),
          clientId: data.clientId?.trim() || undefined,
          sourceReference: payloadSourceReference,
          items: data.items.map((item) => ({
            description: item.description.trim(),
            skuOrCode: item.skuOrCode?.trim() || undefined,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            unitPriceAmount: Number(item.unitPrice),
            sourceType: item.sourceType?.trim() || payloadSourceReference?.type || 'INVENTORY_ITEM',
            sourceId:
              item.sourceId?.trim() || payloadSourceReference?.referenceId || 'item_default',
            discount: item.discount
              ? {
                  type: item.discount.type,
                  value: Number(item.discount.value),
                  reason: item.discount.reason?.trim() || undefined,
                }
              : undefined,
          })),
          orderDiscount:
            hasOrderDiscount && data.orderDiscount
              ? {
                  type: data.orderDiscount.type,
                  value: Number(data.orderDiscount.value),
                  reason: data.orderDiscount.reason?.trim() || undefined,
                }
              : undefined,
        },
        idempotencyKey,
      });

      setIsNavigatingPostSubmit(true);
      navigate(SALES_ROUTES.detail(created.id));
    } catch (err: unknown) {
      setIsNavigatingPostSubmit(false);
      if (err instanceof ValidationError) {
        applyServerErrors(err, { fallbackField: 'currency' });
      }

      const errorObj = err as Record<string, unknown>;
      const status =
        (errorObj?.status as number | undefined) ??
        (errorObj?.statusCode as number | undefined) ??
        ((errorObj?.response as Record<string, unknown>)?.status as number | undefined);

      const message =
        ((errorObj?.response as Record<string, unknown>)?.data as Record<string, unknown>)
          ?.message ??
        (errorObj?.message as string) ??
        'Failed to initialize commercial sale agreement.';

      const isConflict =
        status === 409 ||
        String(message).toLowerCase().includes('duplicate') ||
        String(message).toLowerCase().includes('already exists');

      const isAmbiguous =
        !status ||
        status === 0 ||
        String(message).toLowerCase().includes('network') ||
        String(message).toLowerCase().includes('timeout') ||
        String(message).toLowerCase().includes('fetch');

      setServerError({
        status,
        message: Array.isArray(message) ? message.join(', ') : String(message),
        isConflict,
        isAmbiguous,
      });
    }
  };

  const isPending = createSaleMutation.isPending || isSubmitting;

  return (
    <div className="space-y-6 max-w-4xl mx-auto" data-testid="sale-create-page">
      {/* 1. Header Navigation */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs gap-1"
            data-testid="back-to-directory-btn"
          >
            <Link to={SALES_ROUTES.list()}>
              <ArrowLeft className="h-4 w-4" /> Back to Directory
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Create Commercial Sale
              </h1>
              <Badge variant="outline" className="text-xs">
                DRAFT Session
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Initialize a commercial checkout agreement. Line items and discounts will be
              authoritatively computed upon submission.
            </p>
          </div>
        </div>
      </div>

      {/* Commercial Agreement Scope Disclaimer */}
      <div
        className="p-3.5 rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-950 dark:text-blue-200 text-xs flex items-start gap-2.5"
        data-testid="sale-create-scope-banner"
      >
        <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
        <div className="space-y-0.5">
          <span className="font-semibold block">Commercial Agreement Scope:</span>
          <span>
            Creating a sale initializes a commercial order agreement in <strong>DRAFT</strong>{' '}
            status. This action defines the purchased line items, discounts, and net payable total.
            It does
            <strong> NOT</strong> collect payment tender, charge client payment methods, or settle
            funds. Payment recording occurs in a separate, explicit step once the agreement is
            finalized.
          </span>
        </div>
      </div>

      {/* 2. Server Error / Duplicate Conflict Alert */}
      {serverError && (
        <div
          className={`flex items-start gap-3 p-4 rounded-lg border text-sm ${
            serverError.isConflict
              ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400'
              : 'border-destructive/30 bg-destructive/10 text-destructive'
          }`}
          data-testid="sale-create-error"
          role="alert"
        >
          {serverError.isConflict ? (
            <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          )}
          <div className="space-y-1">
            <p className="font-semibold">
              {serverError.isConflict
                ? 'Duplicate Sale Transaction Detected'
                : 'Sale Initialization Failed'}
            </p>
            <p className="text-xs">{serverError.message}</p>
            {serverError.isConflict && (
              <p className="text-xs opacity-90">
                To prevent duplicate charges or repeated billing of the same entity, the system
                prohibits creating duplicate sales for the same upstream reference.
              </p>
            )}
            {serverError.isAmbiguous && (
              <p className="text-xs opacity-90 mt-1">
                A network interruption occurred. Because the server may have already processed this
                agreement, please check the{' '}
                <Link
                  to={SALES_ROUTES.list()}
                  className="underline font-semibold hover:text-foreground"
                >
                  Sales Directory
                </Link>{' '}
                before resubmitting. If resubmitting, your original idempotency token is safely
                preserved.
              </p>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
        {/* 3. Customer & Currency Settings */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-primary" />
              Customer & Currency
            </CardTitle>
            <CardDescription className="text-xs">
              Assign this agreement to a registered client or record it as an anonymous walk-in.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Client ID */}
              <div className="space-y-1.5">
                <label htmlFor="clientId" className="text-xs font-medium text-foreground">
                  Client ID{' '}
                  <span className="text-muted-foreground font-normal">(Optional for Walk-in)</span>
                </label>
                <Input
                  id="clientId"
                  placeholder="e.g. client_123 (Leave empty for Walk-in)"
                  {...register('clientId')}
                  className="h-9 text-xs"
                  aria-describedby="client-id-helper"
                  data-testid="sale-client-id-input"
                />
                <p id="client-id-helper" className="text-[11px] text-muted-foreground">
                  If left blank, this checkout will be tracked as an anonymous Walk-in customer.
                </p>
              </div>

              {/* Currency */}
              <div className="space-y-1.5">
                <label htmlFor="currency" className="text-xs font-medium text-foreground">
                  Currency Code (ISO-4217) *
                </label>
                <Input
                  id="currency"
                  defaultValue="USD"
                  maxLength={3}
                  {...register('currency')}
                  className="h-9 text-xs uppercase font-mono"
                  aria-invalid={Boolean(errors.currency)}
                  aria-describedby={errors.currency ? 'currency-error' : 'currency-helper'}
                  data-testid="sale-currency-input"
                />
                {errors.currency && (
                  <p id="currency-error" className="text-xs text-destructive">
                    {errors.currency.message}
                  </p>
                )}
                <p id="currency-helper" className="text-[11px] text-muted-foreground">
                  3-letter uppercase currency code (e.g. USD, CAD, EUR).
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 4. Commercial Origin Source Selection */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Tag className="h-4 w-4 text-primary" />
              Origin Source Reference
            </CardTitle>
            <CardDescription className="text-xs">
              Specify whether this sale originates from an upstream catalog entity or a walk-in
              retail session.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4 text-xs">
              <label className="flex items-center gap-2 cursor-pointer font-medium">
                <input
                  type="radio"
                  name="originType"
                  checked={!hasSourceReference}
                  onChange={() => {
                    setHasSourceReference(false);
                    setValue('hasSourceReference', false, { shouldValidate: true });
                  }}
                  className="h-4 w-4 text-primary"
                  data-testid="origin-walkin-radio"
                />
                <span>Walk-in / Point of Sale Checkout</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer font-medium">
                <input
                  type="radio"
                  name="originType"
                  checked={hasSourceReference}
                  onChange={() => {
                    setHasSourceReference(true);
                    setValue('hasSourceReference', true, { shouldValidate: true });
                  }}
                  className="h-4 w-4 text-primary"
                  data-testid="origin-source-radio"
                />
                <span>Upstream Entity Reference (Catalog / Appointment / Plan)</span>
              </label>
            </div>

            {hasSourceReference && (
              <div
                className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-lg border border-border bg-muted/20"
                data-testid="source-reference-fields"
              >
                <div className="space-y-1">
                  <label htmlFor="source-type" className="text-xs font-medium">
                    Source Type *
                  </label>
                  <select
                    id="source-type"
                    {...register('sourceReference.type')}
                    className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
                    data-testid="source-type-select"
                  >
                    {VALID_SALE_SOURCE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label htmlFor="source-ref-id" className="text-xs font-medium">
                    Reference ID *
                  </label>
                  <Input
                    id="source-ref-id"
                    placeholder="e.g. inv_item_123 or session_456"
                    {...register('sourceReference.referenceId')}
                    className="h-8 text-xs"
                    aria-invalid={Boolean(errors.sourceReference?.referenceId)}
                    aria-describedby={
                      errors.sourceReference?.referenceId ? 'source-ref-id-error' : undefined
                    }
                    data-testid="source-reference-id-input"
                  />
                  {errors.sourceReference?.referenceId && (
                    <p id="source-ref-id-error" className="text-[11px] text-destructive">
                      {errors.sourceReference.referenceId.message}
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <label htmlFor="source-ref-code" className="text-xs font-medium">
                    Order / Reference Code
                  </label>
                  <Input
                    id="source-ref-code"
                    placeholder="e.g. SKU or order tag"
                    {...register('sourceReference.referenceCode')}
                    className="h-8 text-xs"
                    data-testid="source-reference-code-input"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 5. Line Items */}
        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">Line Items</CardTitle>
              <CardDescription className="text-xs">
                Add catalog items or services to this checkout session.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() =>
                append({
                  sourceType: 'INVENTORY_ITEM',
                  sourceId: `item_${Date.now()}`,
                  description: '',
                  skuOrCode: '',
                  unitPrice: 0.0,
                  quantity: 1,
                })
              }
              className="h-8 text-xs gap-1.5"
              data-testid="add-line-item-btn"
            >
              <Plus className="h-3.5 w-3.5" /> Add Item
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {errors.items?.message && (
              <p className="text-xs text-destructive font-medium">{errors.items.message}</p>
            )}

            {fields.map((field, index) => (
              <div
                key={field.id}
                className="p-3.5 border border-border rounded-lg bg-muted/15 space-y-3"
                data-testid={`line-item-row-${index}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Line Item #{index + 1}
                  </span>
                  {fields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      onClick={() => remove(index)}
                      className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
                      aria-label={`Remove line item ${index + 1}`}
                      data-testid={`remove-line-item-${index}`}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  {/* Description */}
                  <div className="space-y-1 sm:col-span-2">
                    <label htmlFor={`item-desc-${index}`} className="text-xs font-medium">
                      Description *
                    </label>
                    <Input
                      id={`item-desc-${index}`}
                      placeholder="e.g. Whey Protein 1kg"
                      {...register(`items.${index}.description` as const)}
                      className="h-8 text-xs"
                      aria-invalid={Boolean(errors.items?.[index]?.description)}
                      aria-describedby={
                        errors.items?.[index]?.description ? `item-desc-error-${index}` : undefined
                      }
                      data-testid={`item-desc-${index}`}
                    />
                    {errors.items?.[index]?.description && (
                      <p id={`item-desc-error-${index}`} className="text-[11px] text-destructive">
                        {errors.items[index]?.description?.message}
                      </p>
                    )}
                  </div>

                  {/* SKU / Code */}
                  <div className="space-y-1">
                    <label htmlFor={`item-sku-${index}`} className="text-xs font-medium">
                      SKU / Code
                    </label>
                    <Input
                      id={`item-sku-${index}`}
                      placeholder="e.g. PROT-01"
                      {...register(`items.${index}.skuOrCode` as const)}
                      className="h-8 text-xs font-mono"
                      data-testid={`item-sku-${index}`}
                    />
                  </div>

                  {/* Category */}
                  <div className="space-y-1">
                    <label htmlFor={`item-source-type-${index}`} className="text-xs font-medium">
                      Category
                    </label>
                    <select
                      id={`item-source-type-${index}`}
                      {...register(`items.${index}.sourceType` as const)}
                      className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
                      data-testid={`item-source-type-${index}`}
                    >
                      {VALID_SALE_SOURCE_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Unit Price */}
                  <div className="space-y-1">
                    <label htmlFor={`item-price-${index}`} className="text-xs font-medium">
                      Unit Price ({watchedCurrency}) *
                    </label>
                    <Input
                      id={`item-price-${index}`}
                      type="number"
                      step="0.01"
                      min={0}
                      autoComplete="off"
                      placeholder="0.00"
                      {...register(`items.${index}.unitPrice` as const, { valueAsNumber: true })}
                      className="h-8 text-xs font-mono"
                      aria-invalid={Boolean(errors.items?.[index]?.unitPrice)}
                      aria-describedby={
                        errors.items?.[index]?.unitPrice ? `item-price-error-${index}` : undefined
                      }
                      data-testid={`item-price-${index}`}
                    />
                    {errors.items?.[index]?.unitPrice && (
                      <p id={`item-price-error-${index}`} className="text-[11px] text-destructive">
                        {errors.items[index]?.unitPrice?.message}
                      </p>
                    )}
                  </div>

                  {/* Quantity */}
                  <div className="space-y-1">
                    <label htmlFor={`item-quantity-${index}`} className="text-xs font-medium">
                      Quantity *
                    </label>
                    <Input
                      id={`item-quantity-${index}`}
                      type="number"
                      step="1"
                      min={0.001}
                      autoComplete="off"
                      defaultValue={1}
                      {...register(`items.${index}.quantity` as const, { valueAsNumber: true })}
                      className="h-8 text-xs font-mono"
                      aria-invalid={Boolean(errors.items?.[index]?.quantity)}
                      aria-describedby={
                        errors.items?.[index]?.quantity ? `item-quantity-error-${index}` : undefined
                      }
                      data-testid={`item-quantity-${index}`}
                    />
                    {errors.items?.[index]?.quantity && (
                      <p
                        id={`item-quantity-error-${index}`}
                        className="text-[11px] text-destructive"
                      >
                        {errors.items[index]?.quantity?.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* 6. Order Discount (Optional) */}
        <Card className="border-border bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Percent className="h-4 w-4 text-primary" />
                Order-Level Discount
              </CardTitle>
              <CardDescription className="text-xs">
                Optionally apply a fixed or percentage discount to the entire sale agreement.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setHasOrderDiscount(!hasOrderDiscount)}
              className="h-7 text-xs"
              data-testid="toggle-order-discount-btn"
            >
              {hasOrderDiscount ? 'Remove Discount' : 'Add Discount'}
            </Button>
          </CardHeader>
          {hasOrderDiscount && (
            <CardContent className="space-y-3 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label htmlFor="order-discount-type" className="text-xs font-medium">
                    Discount Type
                  </label>
                  <select
                    id="order-discount-type"
                    {...register('orderDiscount.type')}
                    className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
                    data-testid="order-discount-type-select"
                  >
                    <option value="PERCENTAGE">Percentage (%)</option>
                    <option value="FIXED">Fixed Amount ({watchedCurrency})</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label htmlFor="order-discount-value" className="text-xs font-medium">
                    Discount Value *
                  </label>
                  <Input
                    id="order-discount-value"
                    type="number"
                    step="0.01"
                    min={0}
                    autoComplete="off"
                    placeholder="0.00"
                    {...register('orderDiscount.value', { valueAsNumber: true })}
                    className="h-8 text-xs font-mono"
                    aria-invalid={Boolean(errors.orderDiscount?.value)}
                    aria-describedby={
                      errors.orderDiscount?.value ? 'order-discount-value-error' : undefined
                    }
                    data-testid="order-discount-value-input"
                  />
                  {errors.orderDiscount?.value && (
                    <p id="order-discount-value-error" className="text-[11px] text-destructive">
                      {errors.orderDiscount.value.message}
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <label htmlFor="order-discount-reason" className="text-xs font-medium">
                    Reason / Authorization
                  </label>
                  <Input
                    id="order-discount-reason"
                    placeholder="e.g. Promotional coupon, Manager override"
                    {...register('orderDiscount.reason')}
                    className="h-8 text-xs"
                    data-testid="order-discount-reason-input"
                  />
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        {/* 7. Client-Side Calculation Preview & Financial Disclosure */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span>Estimated Calculation Preview</span>
              <span className="text-xs font-normal text-muted-foreground">
                Subject to server-side precision verification
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-2.5 p-3 rounded-md border border-border bg-muted/30 text-xs text-muted-foreground">
              <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <span>
                <strong>Authoritative Totals Policy:</strong> In accordance with Kinergy financial
                safety rules, browser calculations shown below are estimates only. Authoritative
                monetary precision, fractional rounding, and tax allocations are strictly computed
                by the backend domain aggregate upon submission.
              </span>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between py-1 border-b border-border">
                <span className="text-muted-foreground">Estimated Subtotal:</span>
                <span className="font-mono font-medium" data-testid="preview-subtotal">
                  {watchedCurrency} {previewTotals.subtotal.toFixed(2)}
                </span>
              </div>
              {hasOrderDiscount && (
                <div className="flex justify-between py-1 border-b border-border text-emerald-600 dark:text-emerald-400">
                  <span>Estimated Discount:</span>
                  <span className="font-mono font-medium" data-testid="preview-discount">
                    - {watchedCurrency} {previewTotals.discountTotal.toFixed(2)}
                  </span>
                </div>
              )}
              <div className="flex justify-between py-1.5 font-bold text-sm text-foreground">
                <span>Estimated Net Total:</span>
                <span className="font-mono text-primary" data-testid="preview-total">
                  {watchedCurrency} {previewTotals.total.toFixed(2)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 8. Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-9 px-4 text-xs"
            data-testid="cancel-create-sale-btn"
          >
            <Link to={SALES_ROUTES.list()}>Cancel</Link>
          </Button>

          <Button
            type="submit"
            disabled={isPending}
            className="h-9 px-5 text-xs font-medium gap-1.5"
            data-testid="submit-create-sale-btn"
          >
            {isPending ? 'Initializing Draft Sale...' : 'Initialize Draft Sale'}
          </Button>
        </div>
      </form>

      <ConfirmDiscardDialog
        open={isBlocked}
        onConfirm={proceed}
        onCancel={resetDirtyGuard}
        title="Discard new sale draft?"
        description="You have unsaved line items or customer data that will be lost. Are you sure you want to discard this draft?"
      />
    </div>
  );
};
