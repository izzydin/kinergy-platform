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
import { AlertCircle, Link2, ShieldAlert } from 'lucide-react';
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
} from '../../../shared/forms';
import { useLinkIdentityMutation } from '../hooks/use-client-mutations';
import {
  clientLinkIdentitySchema,
  type ClientLinkIdentityFormValues,
} from '../schemas/client-link-identity.schema';
import type { ClientModel } from '../types/client.types';

export interface ClientLinkIdentityDialogProps {
  readonly client: ClientModel | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export const ClientLinkIdentityDialog: React.FC<ClientLinkIdentityDialogProps> = ({
  client,
  open,
  onOpenChange,
}) => {
  const linkMutation = useLinkIdentityMutation();
  const isLockedRef = useRef(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const form = useForm<ClientLinkIdentityFormValues>({
    resolver: zodResolver(clientLinkIdentitySchema),
    defaultValues: {
      identityId: '',
    },
    mode: 'onTouched',
  });

  const {
    handleSubmit,
    control,
    reset,
    setError,
    clearErrors,
    formState: { errors, isSubmitting, isSubmitted },
  } = form;

  // Reset state on open
  useEffect(() => {
    if (open) {
      setGeneralError(null);
      reset({ identityId: '' });
    }
  }, [open, reset]);

  const onSubmit = async (values: ClientLinkIdentityFormValues) => {
    if (!client || isLockedRef.current) return;

    isLockedRef.current = true;
    setGeneralError(null);
    clearErrors();

    try {
      await linkMutation.mutateAsync({
        id: client.id,
        identityId: values.identityId.trim(),
      });

      onOpenChange(false);
    } catch (err: unknown) {
      const status =
        (err as { status?: number })?.status ?? (err as { statusCode?: number })?.statusCode;
      const message =
        (err as { message?: string })?.message ??
        'An unexpected error occurred while linking identity credentials.';

      if (status === 409 || message.toLowerCase().includes('already linked')) {
        setError('identityId', {
          type: 'manual',
          message:
            'This client is already linked to an identity account or the specified identity is already linked to another client profile.',
        });
      } else if (status === 404 || message.toLowerCase().includes('not found')) {
        setGeneralError('The target client record could not be found.');
      } else if (status === 403 || message.toLowerCase().includes('forbidden')) {
        setGeneralError('Access Denied: You do not have permission to link identity accounts.');
      } else {
        setGeneralError(message);
      }
    } finally {
      isLockedRef.current = false;
    }
  };

  const isPending = isSubmitting || linkMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !isPending && onOpenChange(nextOpen)}>
      <DialogContent className="sm:max-w-md" data-testid="client-link-identity-dialog">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
              <Link2 className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-slate-900">
                Link User Account Identity
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Associate an authenticated user identity with this business profile.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Informational Guidance Alert */}
        <Alert className="bg-slate-50 border-slate-200 py-2.5">
          <ShieldAlert className="h-4 w-4 text-slate-500" aria-hidden="true" />
          <AlertTitle className="text-xs font-semibold text-slate-800">
            One-Way Relationship Policy
          </AlertTitle>
          <AlertDescription className="text-xs text-slate-600 mt-0.5">
            Linking binds authentication credentials to{' '}
            <span className="font-semibold text-slate-900">
              {client?.fullName || client?.referenceNumber}
            </span>
            . In accordance with platform security and domain invariants, unlinking is not supported
            once established.
          </AlertDescription>
        </Alert>

        {/* Server Error Alert */}
        {generalError && (
          <Alert variant="destructive" className="py-2.5" role="alert">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            <AlertTitle className="text-xs font-semibold">Linking Failed</AlertTitle>
            <AlertDescription className="text-xs mt-0.5">{generalError}</AlertDescription>
          </Alert>
        )}

        {/* Validation Summary */}
        <FormValidationSummary errors={errors} isSubmitted={isSubmitted} />

        <Form {...form}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-1">
            <FormField
              control={control}
              name="identityId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="link-identity-id">
                    User Account / Identity ID <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      id="link-identity-id"
                      placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                      disabled={isPending}
                      aria-invalid={Boolean(errors.identityId)}
                      data-testid="link-identity-input"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormActions className="pt-3 border-t border-slate-100">
              <FormCancelButton onCancel={() => onOpenChange(false)} disabled={isPending}>
                Cancel
              </FormCancelButton>
              <FormSubmitButton
                isSubmitting={isPending}
                loadingText="Linking Identity..."
                data-testid="submit-link-identity-button"
              >
                Confirm & Link Identity
              </FormSubmitButton>
            </FormActions>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
