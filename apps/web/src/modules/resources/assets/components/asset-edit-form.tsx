import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AssetStatus } from '@kinergy-platform/core';
import {
  Input,
  Card,
  CardContent,
  Badge,
  Alert,
  AlertTitle,
  AlertDescription,
} from '@kinergy-platform/ui';
import { Lock, AlertTriangle, MapPin, ShieldAlert } from 'lucide-react';
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
import { updateAssetDetailsSchema, type UpdateAssetDetailsFormData } from '../schemas';
import type { FixedAssetVM, UpdateFixedAssetDetailsInputVM } from '../types';
import { AssetStatusBadge } from './asset-status-badge';
import { AssetConditionBadge } from './asset-condition-badge';
import { AssetCategoryBadge } from './asset-category-badge';

export interface AssetEditFormProps {
  /**
   * Authoritative fixed asset entity loaded from backend.
   */
  readonly asset: FixedAssetVM;
  /**
   * Update submission handler.
   */
  readonly onSubmit: (data: UpdateFixedAssetDetailsInputVM) => void;
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
}

export const AssetEditForm: React.FC<AssetEditFormProps> = ({
  asset,
  onSubmit,
  onCancel,
  isSubmitting = false,
  serverError,
}) => {
  const isDecommissioned =
    asset.status === AssetStatus.SOLD || asset.status === AssetStatus.RETIRED;

  const form = useForm<UpdateAssetDetailsFormData>({
    resolver: zodResolver(updateAssetDetailsSchema),
    defaultValues: {
      name: asset.name,
      description: asset.description ?? '',
      notes: '',
      reason: '',
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

  // Dirty guard intercepts internal navigation when edits are unsaved
  const {
    isBlocked,
    proceed,
    reset: cancelDiscard,
  } = useDirtyGuard({
    isDirty: isDirty && !isNavigatingPostSubmit && !isDecommissioned,
    isSubmitSuccessful: isSubmitSuccessful || isNavigatingPostSubmit,
    enabled: !isNavigatingPostSubmit && !isDecommissioned,
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

  const handleFormSubmit = (values: UpdateAssetDetailsFormData) => {
    if (isDecommissioned) return;
    setIsNavigatingPostSubmit(true);
    onSubmit({
      name: values.name?.trim() || undefined,
      description: values.description?.trim() || undefined,
      notes: values.notes?.trim() || undefined,
      reason: values.reason?.trim() || undefined,
    });
  };

  const handleCancelClick = () => {
    if (onCancel) {
      onCancel();
    }
  };

  return (
    <div className="space-y-6">
      {/* Terminal State Warning Banner */}
      {isDecommissioned && (
        <Alert
          variant="destructive"
          className="border-destructive/50 bg-destructive/10 text-destructive dark:border-destructive"
          data-testid="terminal-asset-alert"
        >
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle className="font-semibold tracking-tight">
            Terminal Lifecycle State ({asset.status})
          </AlertTitle>
          <AlertDescription className="text-sm mt-1">
            This asset has been decommissioned ({asset.status}). Per enterprise domain invariants{' '}
            <code>[AST-INV-1]</code> and <code>[AST-INV-2]</code>, decommissioned equipment is
            permanently locked against modifications.
          </AlertDescription>
        </Alert>
      )}

      {/* Main Edit Form Card */}
      <Card className="border-border bg-card">
        <CardContent className="p-6">
          <Form {...form}>
            <form
              onSubmit={handleSubmit(handleFormSubmit)}
              noValidate
              aria-label="Edit Fixed Asset Form"
            >
              <FormLayout variant="page">
                {/* Global validation summary alert */}
                <FormValidationSummary errors={errors} />

                {/* Section 1: Immutable Identification & Classification */}
                <FormSection
                  title="Asset Identification & Classification"
                  description="Immutable hardware identifiers established during initial commissioning."
                >
                  <FormFieldGroup columns={2}>
                    {/* Immutable Asset Tag */}
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-1.5 text-sm font-medium leading-none text-foreground select-none">
                        <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                        Asset Barcode / RFID Tag
                        <Badge variant="secondary" className="ml-1 text-[10px] py-0 px-1.5">
                          Immutable
                        </Badge>
                      </label>
                      <div className="flex items-center h-10 w-full rounded-md border border-input bg-muted/60 px-3 py-2 text-sm font-mono font-medium text-foreground select-all">
                        {asset.assetTag}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Permanent hardware identification tag. Established at commissioning.
                      </p>
                    </div>

                    {/* Immutable Category */}
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-1.5 text-sm font-medium leading-none text-foreground select-none">
                        <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                        Taxonomy Category
                        <Badge variant="secondary" className="ml-1 text-[10px] py-0 px-1.5">
                          Immutable
                        </Badge>
                      </label>
                      <div className="flex items-center h-10 w-full rounded-md border border-input bg-muted/60 px-3 py-2 text-sm text-foreground">
                        <AssetCategoryBadge category={asset.category} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Governs maintenance intervals and regulatory depreciation schedule.
                      </p>
                    </div>
                  </FormFieldGroup>
                </FormSection>

                {/* Section 2: Editable Descriptive Metadata */}
                <FormSection
                  title="Descriptive Metadata"
                  description="Commercial equipment naming, technical specifications, and internal operational remarks."
                  withSeparator
                >
                  <FormFieldGroup columns={2}>
                    {/* Equipment Name Field */}
                    <FormField
                      control={control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>Equipment Name / Model</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g. Commercial Treadmill T80"
                              disabled={isDecommissioned || isSubmitting}
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            Manufacturer make and descriptive commercial model (2-150 characters).
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Reason for Modification */}
                    <FormField
                      control={control}
                      name="reason"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Audit Change Reason</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g. Model clarification or manufacturer rebranding"
                              disabled={isDecommissioned || isSubmitting}
                              {...field}
                              value={field.value ?? ''}
                            />
                          </FormControl>
                          <FormDescription>
                            Optional audit trail explanation preserved in the change history ledger.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </FormFieldGroup>

                  {/* Technical Description Field */}
                  <FormField
                    control={control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Equipment Specifications</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Optional technical specifications, power requirements, or dimensions"
                            disabled={isDecommissioned || isSubmitting}
                            {...field}
                            value={field.value ?? ''}
                          />
                        </FormControl>
                        <FormDescription>
                          Technical parameters or vendor model specifications (max 1000 characters).
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Operational Notes */}
                  <FormField
                    control={control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Operational Remarks / Notes</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Optional technician notes or warranty policy updates"
                            disabled={isDecommissioned || isSubmitting}
                            {...field}
                            value={field.value ?? ''}
                          />
                        </FormControl>
                        <FormDescription>
                          Internal operational context preserved in the asset lifecycle record.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </FormSection>

                {/* Section 3: Governed Lifecycle Boundaries (Explicit Workflows) */}
                <FormSection
                  title="Governed Lifecycle Dimensions"
                  description="Operations governed by audited domain workflows rather than generic text edits."
                  withSeparator
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Location Governance Notice */}
                    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
                      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <MapPin className="h-4 w-4 text-primary" />
                        <span>Physical Location</span>
                      </div>
                      <div className="text-sm space-y-1">
                        <p className="font-mono text-xs">
                          Facility:{' '}
                          <span className="font-medium text-foreground">
                            {asset.location.facilityId}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Room: {asset.location.roomId || 'Unassigned'} • Zone:{' '}
                          {asset.location.zone || 'Unassigned'}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground pt-1 border-t border-border/50">
                        Physical relocations require audited location transfers. Use{' '}
                        <strong>Transfer Location</strong> in the Asset Cockpit.
                      </p>
                    </div>

                    {/* Status & Condition Governance Notice */}
                    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
                      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <ShieldAlert className="h-4 w-4 text-primary" />
                        <span>Operational State & Condition</span>
                      </div>
                      <div className="flex items-center gap-2 pt-0.5">
                        <AssetStatusBadge status={asset.status} />
                        <AssetConditionBadge condition={asset.condition} />
                      </div>
                      <p className="text-xs text-muted-foreground pt-1 border-t border-border/50">
                        Status transitions and condition assessments are strictly audited. Use{' '}
                        <strong>Change Status</strong> or <strong>Log Inspection</strong> in the
                        Asset Cockpit.
                      </p>
                    </div>
                  </div>
                </FormSection>

                {/* Form Action Controls */}
                <FormActions>
                  <FormCancelButton onCancel={handleCancelClick} isSubmitting={isSubmitting} />
                  <FormResetButton
                    onReset={() => reset()}
                    isSubmitting={isSubmitting}
                    disabled={!isDirty || isDecommissioned}
                  />
                  <FormSubmitButton isSubmitting={isSubmitting} disabled={isDecommissioned}>
                    {isDecommissioned ? 'Asset Decommissioned' : 'Save Changes'}
                  </FormSubmitButton>
                </FormActions>
              </FormLayout>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Dirty state confirmation dialog */}
      <ConfirmDiscardDialog open={isBlocked} onConfirm={proceed} onCancel={cancelDiscard} />
    </div>
  );
};
