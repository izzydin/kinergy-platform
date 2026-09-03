import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AssetCategory,
  AssetStatus,
  AssetCondition,
  ASSET_CATEGORY_REGISTRY,
  ASSET_CONDITION_REGISTRY,
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
import { createAssetSchema, type CreateAssetFormData } from '../schemas';
import type { CreateFixedAssetInputVM } from '../types';

export interface AssetCreateFormProps {
  /**
   * Submission handler callback.
   * Receives strongly validated CreateFixedAssetInputVM.
   */
  onSubmit: (data: CreateFixedAssetInputVM) => Promise<void> | void;
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

const INITIAL_STATUS_OPTIONS = [
  { value: AssetStatus.ACTIVE, label: 'Active (Fleet In-Service)' },
  { value: AssetStatus.UNDER_MAINTENANCE, label: 'Under Maintenance (Staged for Service)' },
  { value: AssetStatus.DAMAGED, label: 'Damaged (Offline / Awaiting Repair)' },
];

export const AssetCreateForm: React.FC<AssetCreateFormProps> = ({
  onSubmit,
  onCancel,
  isSubmitting = false,
  serverError,
}) => {
  const form = useForm<CreateAssetFormData>({
    resolver: zodResolver(createAssetSchema),
    defaultValues: {
      assetTag: '',
      name: '',
      description: '',
      category: AssetCategory.GYM_EQUIPMENT,
      purchaseDate: new Date().toISOString().split('T')[0],
      purchaseValueAmount: 0,
      purchaseValueCurrency: 'USD',
      currentEstimatedValueAmount: undefined,
      condition: AssetCondition.EXCELLENT,
      status: AssetStatus.ACTIVE,
      location: {
        facilityId: '',
        roomId: '',
        zone: '',
        description: '',
      },
      notes: '',
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

  const [isNavigatingPostSubmit, setIsNavigatingPostSubmit] = React.useState(false);

  // Dirty guard intercepts internal navigation and beforeunload when edits are unsaved
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
        applyServerErrors(serverError, { fallbackField: 'assetTag' });
      } else {
        setError('assetTag', { message: serverError.message });
      }
    }
  }, [serverError, applyServerErrors, setError]);

  const handleFormSubmit = (values: CreateAssetFormData) => {
    setIsNavigatingPostSubmit(true);
    onSubmit({
      assetTag: values.assetTag.trim().toUpperCase(),
      name: values.name.trim(),
      description: values.description?.trim() || undefined,
      category: values.category,
      purchaseDate: values.purchaseDate,
      purchaseValueAmount: values.purchaseValueAmount,
      purchaseValueCurrency: values.purchaseValueCurrency?.trim() || 'USD',
      currentEstimatedValueAmount:
        typeof values.currentEstimatedValueAmount === 'number'
          ? values.currentEstimatedValueAmount
          : undefined,
      condition: values.condition,
      status: values.status,
      location: {
        facilityId: values.location.facilityId.trim(),
        roomId: values.location.roomId?.trim() || undefined,
        zone: values.location.zone?.trim() || undefined,
        description: values.location.description?.trim() || undefined,
      },
      notes: values.notes?.trim() || undefined,
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
              aria-label="Commission Fixed Asset Form"
            >
              <FormLayout variant="page">
                {/* Global validation summary alert when submitted with errors */}
                <FormValidationSummary errors={errors} />

                {/* Section 1: Hardware Identification & Classification */}
                <FormSection
                  title="Hardware Identification & Taxonomy"
                  description="Physical asset barcode tag, model naming, and equipment taxonomy classification."
                >
                  <FormFieldGroup columns={2}>
                    {/* Asset Tag Barcode */}
                    <FormField
                      control={control}
                      name="assetTag"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>Asset Barcode Tag</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g. AST-GYM-001"
                              autoCapitalize="characters"
                              className="font-mono uppercase"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                            />
                          </FormControl>
                          <FormDescription>
                            Unique hardware tag identifier (3-50 uppercase chars, dashes,
                            underscores).
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Equipment Name / Model */}
                    <FormField
                      control={control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>Equipment Name / Model</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Treadmill Commercial T80" {...field} />
                          </FormControl>
                          <FormDescription>
                            Manufacturer make and descriptive commercial model (2-150 characters).
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </FormFieldGroup>

                  <FormFieldGroup columns={2}>
                    {/* Equipment Category Classification */}
                    <FormField
                      control={control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>Asset Category</FormLabel>
                          <FormControl>
                            <select
                              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                              {...field}
                            >
                              {Object.values(AssetCategory).map((cat) => (
                                <option key={cat} value={cat}>
                                  {ASSET_CATEGORY_REGISTRY[cat]?.displayName ??
                                    cat.replace(/_/g, ' ')}
                                </option>
                              ))}
                            </select>
                          </FormControl>
                          <FormDescription>
                            Determines maintenance schedule defaults and depreciation schedule.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Description / Specifications */}
                    <FormField
                      control={control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Equipment Specifications</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Optional specifications, power requirements, or dimensions"
                              {...field}
                              value={field.value ?? ''}
                            />
                          </FormControl>
                          <FormDescription>
                            Technical notes or vendor model specifications (max 1000 characters).
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </FormFieldGroup>
                </FormSection>

                {/* Section 2: Physical Deployment Location */}
                <FormSection
                  title="Physical Deployment Location"
                  description="Initial facility, department room, and zone placement for physical auditing."
                  withSeparator
                >
                  <FormFieldGroup columns={2}>
                    {/* Facility Identifier */}
                    <FormField
                      control={control}
                      name="location.facilityId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>Facility Code</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. fac-main or Facility 1" {...field} />
                          </FormControl>
                          <FormDescription>
                            Authoritative enterprise facility campus identifier.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Room Identifier */}
                    <FormField
                      control={control}
                      name="location.roomId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Room / Studio</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g. room-cardio-1 or Studio B"
                              {...field}
                              value={field.value ?? ''}
                            />
                          </FormControl>
                          <FormDescription>
                            Physical room or studio within the facility.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </FormFieldGroup>

                  <FormFieldGroup columns={2}>
                    {/* Floor / Zone Designation */}
                    <FormField
                      control={control}
                      name="location.zone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Floor / Zone</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g. Zone A, Floor 2, East Wing"
                              {...field}
                              value={field.value ?? ''}
                            />
                          </FormControl>
                          <FormDescription>
                            Micro-location zone for rapid technician positioning.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Location Description */}
                    <FormField
                      control={control}
                      name="location.description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Placement Notes</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g. Mounted to north pillar next to cable crossover"
                              {...field}
                              value={field.value ?? ''}
                            />
                          </FormControl>
                          <FormDescription>
                            Descriptive landmarks assisting physical equipment audits.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </FormFieldGroup>
                </FormSection>

                {/* Section 3: Acquisition & Balance Sheet Valuation */}
                <FormSection
                  title="Capital Acquisition & Carrying Valuation"
                  description="Initial invoice cost, purchase date, and opening balance sheet valuation."
                  withSeparator
                >
                  <FormFieldGroup columns={2}>
                    {/* Purchase Date */}
                    <FormField
                      control={control}
                      name="purchaseDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>Acquisition Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormDescription>
                            Official capital expenditure invoice acquisition date.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Original Purchase Cost */}
                    <FormField
                      control={control}
                      name="purchaseValueAmount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>Purchase Acquisition Cost ($)</FormLabel>
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
                            Gross acquisition expenditure for fixed capital accounting.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </FormFieldGroup>

                  <FormFieldGroup columns={2}>
                    {/* Current Estimated Fair Value */}
                    <FormField
                      control={control}
                      name="currentEstimatedValueAmount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Opening Estimated Fair Value ($)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="Defaults to purchase cost if omitted"
                              {...field}
                              value={field.value ?? ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                field.onChange(val === '' ? undefined : Number(val));
                              }}
                            />
                          </FormControl>
                          <FormDescription>
                            Optional fair-market or appraised opening balance sheet value.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Purchase Currency */}
                    <FormField
                      control={control}
                      name="purchaseValueCurrency"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Valuation Currency</FormLabel>
                          <FormControl>
                            <Input placeholder="USD" {...field} />
                          </FormControl>
                          <FormDescription>
                            ISO-4217 financial currency code (defaults to USD).
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </FormFieldGroup>
                </FormSection>

                {/* Section 4: Initial Operational State & Condition */}
                <FormSection
                  title="Initial Operational State & Condition"
                  description="Physical inspection rating and opening operational lifecycle state."
                  withSeparator
                >
                  <FormFieldGroup columns={2}>
                    {/* Initial Status */}
                    <FormField
                      control={control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>Opening Status</FormLabel>
                          <FormControl>
                            <select
                              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                              {...field}
                            >
                              {INITIAL_STATUS_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </FormControl>
                          <FormDescription>
                            Terminal states (RETIRED, SOLD) cannot be selected at onboarding.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Initial Condition */}
                    <FormField
                      control={control}
                      name="condition"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>Physical Condition Rating</FormLabel>
                          <FormControl>
                            <select
                              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                              {...field}
                            >
                              {Object.values(AssetCondition).map((cond) => (
                                <option key={cond} value={cond}>
                                  {`Rank ${ASSET_CONDITION_REGISTRY[cond]?.severityRank ?? ''} • ${
                                    ASSET_CONDITION_REGISTRY[cond]?.displayName ?? cond
                                  }`}
                                </option>
                              ))}
                            </select>
                          </FormControl>
                          <FormDescription>
                            Certified condition baseline from the physical onboarding inspection.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </FormFieldGroup>

                  {/* Onboarding Notes / Serial Numbers */}
                  <FormField
                    control={control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Commissioning Notes</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Optional serial numbers, warranty terms, or onboarding technician notes"
                            {...field}
                            value={field.value ?? ''}
                          />
                        </FormControl>
                        <FormDescription>
                          Immutable initial audit event remarks preserved in the asset lifecycle
                          ledger.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </FormSection>

                {/* Form Action Buttons */}
                <FormActions>
                  <FormCancelButton onCancel={handleCancelClick} isSubmitting={isSubmitting} />
                  <FormResetButton
                    onReset={() => reset()}
                    isSubmitting={isSubmitting}
                    disabled={!isDirty}
                  />
                  <FormSubmitButton isSubmitting={isSubmitting}>Commission Asset</FormSubmitButton>
                </FormActions>
              </FormLayout>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Dirty state confirmation dialog for navigation interception */}
      <ConfirmDiscardDialog open={isBlocked} onConfirm={proceed} onCancel={cancelDiscard} />
    </>
  );
};
