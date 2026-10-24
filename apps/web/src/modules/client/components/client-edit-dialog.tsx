import React, { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Input,
  Alert,
  AlertTitle,
  AlertDescription,
} from '@kinergy-platform/ui';
import { AlertCircle } from 'lucide-react';
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormActions,
  FormSubmitButton,
  FormCancelButton,
  FormValidationSummary,
  useDirtyDialogGuard,
  ConfirmDiscardDialog,
} from '../../../shared/forms';
import { useUpdateClientMutation } from '../hooks/use-client-mutations';
import { clientUpdateSchema, type ClientUpdateFormValues } from '../schemas/client-update.schema';
import { normalizePhoneNumber } from '../schemas/client-registration.schema';
import type { ClientModel } from '../types/client.types';

export interface ClientEditDialogProps {
  readonly client: ClientModel | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export const ClientEditDialog: React.FC<ClientEditDialogProps> = ({
  client,
  open,
  onOpenChange,
}) => {
  const updateMutation = useUpdateClientMutation();
  const isLockedRef = useRef(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const form = useForm<ClientUpdateFormValues>({
    resolver: zodResolver(clientUpdateSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      expectedVersion: 1,
    },
    mode: 'onTouched',
  });

  const {
    handleSubmit,
    control,
    register,
    reset,
    setError,
    clearErrors,
    formState: { errors, isSubmitting, isSubmitted, isDirty, isSubmitSuccessful },
  } = form;

  const { guardedOnOpenChange, isConfirmOpen, confirmDiscard, cancelDiscard } = useDirtyDialogGuard(
    {
      isDirty,
      isSubmitSuccessful,
      onClose: () => onOpenChange(false),
    },
  );

  // Pre-fill form from authoritative client details
  useEffect(() => {
    if (client && open) {
      setGeneralError(null);
      reset({
        firstName: client.firstName || '',
        lastName: client.lastName || '',
        email: client.email || '',
        phone: client.phone || '',
        expectedVersion: client.version,
      });
    }
  }, [client, open, reset]);

  const onSubmit = async (values: ClientUpdateFormValues) => {
    if (!client || isLockedRef.current) return;

    isLockedRef.current = true;
    setGeneralError(null);
    clearErrors();

    try {
      const normalizedPhone = normalizePhoneNumber(values.phone);
      await updateMutation.mutateAsync({
        id: client.id,
        payload: {
          firstName: values.firstName.trim(),
          lastName: values.lastName.trim(),
          email: values.email.trim(),
          phone: normalizedPhone,
          expectedVersion: client.version,
        },
      });

      onOpenChange(false);
    } catch (err: unknown) {
      const status =
        (err as { status?: number })?.status ?? (err as { statusCode?: number })?.statusCode;
      const message =
        (err as { message?: string })?.message ??
        'An unexpected error occurred while saving client details.';

      if (
        status === 412 ||
        message.toLowerCase().includes('version') ||
        message.toLowerCase().includes('concurrency')
      ) {
        setGeneralError(
          'Concurrency Conflict: This client record was modified by another user or session. Please refresh the page to load the latest state.',
        );
      } else if (status === 422 || message.toLowerCase().includes('archived')) {
        setGeneralError(
          'Archived Record: Archived client records cannot be modified. Restore the client to make edits.',
        );
      } else if (
        status === 409 ||
        message.toLowerCase().includes('already exists') ||
        message.toLowerCase().includes('duplicate')
      ) {
        const lowerMsg = message.toLowerCase();
        if (lowerMsg.includes('email')) {
          setError('email', {
            type: 'manual',
            message: 'This email address is already registered to another client profile.',
          });
        }
        if (lowerMsg.includes('phone')) {
          setError('phone', {
            type: 'manual',
            message: 'This phone number is already registered to another client profile.',
          });
        }
        if (!lowerMsg.includes('email') && !lowerMsg.includes('phone')) {
          setGeneralError(message);
        }
      } else {
        setGeneralError(message);
      }
    } finally {
      isLockedRef.current = false;
    }
  };

  const isPending = isSubmitting || updateMutation.isPending;

  return (
    <>
      <Dialog open={open} onOpenChange={guardedOnOpenChange}>
        <DialogContent className="sm:max-w-lg" data-testid="client-edit-dialog">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Edit Client Profile
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Update personal and contact details for{' '}
              <span className="font-semibold text-slate-700">
                {client?.fullName || client?.referenceNumber}
              </span>
              . System identifiers and audit timestamps are server-controlled.
            </DialogDescription>
          </DialogHeader>

          {/* Server / Concurrency Error Alert */}
          {generalError && (
            <Alert variant="destructive" className="py-2.5" role="alert">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              <AlertTitle className="text-xs font-semibold">Update Failed</AlertTitle>
              <AlertDescription className="text-xs mt-0.5">{generalError}</AlertDescription>
            </Alert>
          )}

          {/* Client-side Validation Summary */}
          <FormValidationSummary errors={errors} isSubmitted={isSubmitted} />

          <Form {...form}>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="edit-firstName">
                        First Name <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          id="edit-firstName"
                          autoComplete="given-name"
                          disabled={isPending}
                          aria-invalid={Boolean(errors.firstName)}
                          {...field}
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
                      <FormLabel htmlFor="edit-lastName">
                        Last Name <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          id="edit-lastName"
                          autoComplete="family-name"
                          disabled={isPending}
                          aria-invalid={Boolean(errors.lastName)}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="edit-email">
                      Email Address <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        id="edit-email"
                        type="email"
                        autoComplete="email"
                        disabled={isPending}
                        aria-invalid={Boolean(errors.email)}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="edit-phone">
                      Phone Number <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        id="edit-phone"
                        type="tel"
                        autoComplete="tel"
                        placeholder="+591 70012345"
                        disabled={isPending}
                        aria-invalid={Boolean(errors.phone)}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Immutable Concurrency Token (Hidden) */}
              <input type="hidden" {...register('expectedVersion', { valueAsNumber: true })} />

              <FormActions className="pt-4 border-t border-slate-100">
                <FormCancelButton onCancel={() => guardedOnOpenChange(false)} disabled={isPending}>
                  Cancel
                </FormCancelButton>
                <FormSubmitButton isSubmitting={isPending} loadingText="Saving Changes...">
                  Save Changes
                </FormSubmitButton>
              </FormActions>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Discard changes guard confirmation dialog */}
      <ConfirmDiscardDialog
        open={isConfirmOpen}
        onConfirm={confirmDiscard}
        onCancel={cancelDiscard}
      />
    </>
  );
};
