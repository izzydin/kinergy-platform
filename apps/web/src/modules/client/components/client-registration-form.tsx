import React, { useCallback, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, AlertDescription, AlertTitle, Button, Input } from '@kinergy-platform/ui';
import { AlertCircle, UserPlus, X } from 'lucide-react';
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
  FormSection,
  FormFieldGroup,
  FormActions,
  FormSubmitButton,
  FormCancelButton,
  FormValidationSummary,
} from '../../../shared/forms';
import {
  clientRegistrationSchema,
  normalizePhoneNumber,
  type ClientRegistrationFormData,
} from '../schemas/client-registration.schema';
import {
  formatClientErrorMessage,
  getPotentialMatchesWarning,
  isHardDuplicateError,
} from '../api/client-error';
import { PotentialMatchesCard } from './potential-matches-card';
import type {
  PotentialMatchDTO,
  RegisterClientInputDTO,
  RegisterClientResponseDTO,
} from '../types/client.types';

export interface ClientRegistrationFormProps {
  onSubmit: (data: RegisterClientInputDTO) => Promise<RegisterClientResponseDTO>;
  onSuccess: (client: RegisterClientResponseDTO) => void;
  onCancel?: () => void;
}

export const ClientRegistrationForm: React.FC<ClientRegistrationFormProps> = ({
  onSubmit,
  onSuccess,
  onCancel,
}) => {
  const [serverError, setServerError] = useState<string | null>(null);
  const [potentialMatches, setPotentialMatches] = useState<PotentialMatchDTO[] | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isLockedRef = useRef(false);

  const form = useForm<ClientRegistrationFormData>({
    resolver: zodResolver(clientRegistrationSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      identityId: '',
      bypassSoftDuplicates: false,
    },
    mode: 'onTouched',
  });

  const {
    control,
    handleSubmit,
    setError,
    getValues,
    setValue,
    formState: { errors },
  } = form;

  const executeRegistration = useCallback(
    async (formData: ClientRegistrationFormData, forceBypass = false) => {
      if (isLockedRef.current) return;
      isLockedRef.current = true;
      setIsSubmitting(true);
      setServerError(null);

      try {
        const payload: RegisterClientInputDTO = {
          firstName: formData.firstName.trim(),
          lastName: formData.lastName.trim(),
          email: formData.email.trim().toLowerCase(),
          phone: normalizePhoneNumber(formData.phone),
          identityId: formData.identityId?.trim() || undefined,
          bypassSoftDuplicates: forceBypass || formData.bypassSoftDuplicates,
        };

        const result = await onSubmit(payload);
        setPotentialMatches(null);
        onSuccess(result);
      } catch (err: unknown) {
        const softWarning = getPotentialMatchesWarning(err);
        if (softWarning && softWarning.potentialMatches?.length > 0) {
          setPotentialMatches(softWarning.potentialMatches);
          setServerError(null);
          return;
        }

        if (isHardDuplicateError(err)) {
          const rawMessage = (err as { message?: string }).message || '';
          const lower = rawMessage.toLowerCase();
          if (lower.includes('email')) {
            setError('email', {
              type: 'manual',
              message: 'An active client with this email address already exists.',
            });
          }
          if (lower.includes('phone')) {
            setError('phone', {
              type: 'manual',
              message: 'An active client with this phone number already exists.',
            });
          }
          setServerError(
            'Duplicate Conflict: An active client with this email address or phone number already exists.',
          );
          return;
        }

        setServerError(formatClientErrorMessage(err));
      } finally {
        isLockedRef.current = false;
        setIsSubmitting(false);
      }
    },
    [onSubmit, onSuccess, setError],
  );

  const handleFormSubmit = handleSubmit((data) => {
    executeRegistration(data, false);
  });

  const handleProceedWithSoftDuplicate = useCallback(() => {
    const currentValues = getValues();
    setValue('bypassSoftDuplicates', true);
    executeRegistration(currentValues, true);
  }, [getValues, setValue, executeRegistration]);

  const handleDismissSoftDuplicates = useCallback(() => {
    setPotentialMatches(null);
  }, []);

  return (
    <div className="space-y-6" data-testid="client-registration-form-container">
      {/* 1. Recoverable Server Error Alert */}
      {serverError && (
        <Alert variant="destructive" className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <AlertTitle>Registration Failed</AlertTitle>
              <AlertDescription className="text-xs leading-relaxed">{serverError}</AlertDescription>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setServerError(null)}
            className="h-6 w-6 p-0 text-destructive-foreground hover:bg-destructive/20"
            aria-label="Dismiss error"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </Alert>
      )}

      {/* 2. Soft Duplicate Warning Card */}
      {potentialMatches && potentialMatches.length > 0 && (
        <PotentialMatchesCard
          potentialMatches={potentialMatches}
          onProceedWithDuplicate={handleProceedWithSoftDuplicate}
          onDismiss={handleDismissSoftDuplicates}
          isSubmitting={isSubmitting}
        />
      )}

      {/* 3. Validation Summary */}
      <FormValidationSummary errors={errors} title="Please correct the following fields:" />

      {/* 4. Core Form */}
      <Form {...form}>
        <form onSubmit={handleFormSubmit} noValidate className="space-y-6">
          {/* Section 1: Personal Details */}
          <FormSection
            title="Personal Identification"
            description="Enter the legal identification details of the client."
          >
            <FormFieldGroup columns={2}>
              <FormField
                control={control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>First Name</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="e.g., Jane"
                        autoComplete="given-name"
                        disabled={isSubmitting}
                        aria-required="true"
                        data-testid="first-name-input"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Last Name</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="e.g., Doe"
                        autoComplete="family-name"
                        disabled={isSubmitting}
                        aria-required="true"
                        data-testid="last-name-input"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FormFieldGroup>
          </FormSection>

          {/* Section 2: Contact Information */}
          <FormSection
            title="Contact Information"
            description="Primary communication channels for appointment schedules and receipts."
          >
            <FormFieldGroup columns={2}>
              <FormField
                control={control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Email Address</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        placeholder="e.g., jane.doe@example.com"
                        autoComplete="email"
                        disabled={isSubmitting}
                        aria-required="true"
                        data-testid="email-input"
                      />
                    </FormControl>
                    <FormDescription>
                      Used for receipts, billing notifications, and appointment reminders.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Phone Number</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="tel"
                        placeholder="e.g., +59170012345 or +14155552671"
                        autoComplete="tel"
                        disabled={isSubmitting}
                        aria-required="true"
                        data-testid="phone-input"
                      />
                    </FormControl>
                    <FormDescription>
                      Standard E.164 phone format including country code.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FormFieldGroup>
          </FormSection>

          {/* Section 3: Identity Account (Optional) */}
          <FormSection
            title="Account Linking (Optional)"
            description="Optionally associate an existing user identity account with this client record."
          >
            <FormField
              control={control}
              name="identityId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>User Identity ID</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Optional UUID (e.g. 550e8400-e29b-41d4-a716-446655440000)"
                      disabled={isSubmitting}
                      data-testid="identity-id-input"
                    />
                  </FormControl>
                  <FormDescription>
                    If the client already has a registered portal account, provide their User
                    Identity UUID.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormSection>

          {/* Form Actions */}
          <FormActions align="between" className="pt-4 border-t border-border">
            <div>
              {onCancel && (
                <FormCancelButton
                  onCancel={onCancel}
                  isSubmitting={isSubmitting}
                  data-testid="cancel-registration-button"
                >
                  Cancel
                </FormCancelButton>
              )}
            </div>

            <div className="flex items-center gap-3">
              <FormSubmitButton
                isSubmitting={isSubmitting}
                loadingText="Registering Client..."
                className="gap-2"
                data-testid="submit-registration-button"
              >
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                <span>Register Client</span>
              </FormSubmitButton>
            </div>
          </FormActions>
        </form>
      </Form>
    </div>
  );
};
