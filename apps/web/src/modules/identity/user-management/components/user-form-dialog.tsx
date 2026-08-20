import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
} from '@kinergy-platform/ui';
import {
  ConfirmDiscardDialog,
  Form,
  FormActions,
  FormCancelButton,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormSubmitButton,
  FormValidationSummary,
  useDirtyDialogGuard,
} from '@/shared';
import { useCreateUserMutation } from '../api/user-management-queries';
import { createUserSchema, type CreateUserFormValues } from '../schemas/user-form.schema';

export interface UserFormDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * UserFormDialog Component
 *
 * Accessible modal dialog component for creating new Identity User accounts.
 * Integrated with the C1 Form Framework (RHF, Zod, Form primitives, Validation Summary,
 * Dirty Dialog Guard, and FormActions).
 */
export const UserFormDialog: React.FC<UserFormDialogProps> = ({ open, onOpenChange }) => {
  const createUserMutation = useCreateUserMutation();

  const form = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      email: '',
      name: '',
      role: 'MEMBER',
      status: 'ACTIVE',
    },
  });

  const {
    handleSubmit,
    reset,
    setError,
    setFocus,
    formState: { errors, isSubmitting, isSubmitted, isDirty, isSubmitSuccessful },
  } = form;

  // Intercept dialog dismissals when form has unsaved edits
  const { guardedOnOpenChange, isConfirmOpen, confirmDiscard, cancelDiscard } = useDirtyDialogGuard(
    {
      isDirty,
      isSubmitSuccessful,
      onClose: () => onOpenChange(false),
    },
  );

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (!open) {
      reset({
        email: '',
        name: '',
        role: 'MEMBER',
        status: 'ACTIVE',
      });
    }
  }, [open, reset]);

  const onSubmit = async (values: CreateUserFormValues) => {
    try {
      await createUserMutation.mutateAsync(values);
      reset();
      onOpenChange(false);
    } catch (err: unknown) {
      const apiErr = err as { statusCode?: number; status?: number; message?: string };
      const status = apiErr.statusCode || apiErr.status;

      if (status === 409 || status === 400) {
        setError('email', {
          type: 'manual',
          message: apiErr.message || 'A user account with this email address already exists.',
        });
      }
    }
  };

  const isPending = isSubmitting || createUserMutation.isPending;

  return (
    <>
      <Dialog open={open} onOpenChange={guardedOnOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create User Account</DialogTitle>
            <DialogDescription>
              Add a new user account to the platform. Identity users manage platform authentication
              and access roles.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2" noValidate>
              <FormValidationSummary
                errors={errors}
                isSubmitted={isSubmitted}
                setFocus={setFocus}
              />

              {/* Email Field */}
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Email Address</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="user@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Full Name Field */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Full Name</FormLabel>
                    <FormControl>
                      <Input type="text" placeholder="Jane Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Access Role Field */}
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Access Role</FormLabel>
                    <FormControl>
                      <select
                        className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                        {...field}
                      >
                        <option value="MEMBER">Member</option>
                        <option value="OPERATOR">Operator</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Initial Status Field */}
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Initial Account Status</FormLabel>
                    <FormControl>
                      <select
                        className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                        {...field}
                      >
                        <option value="ACTIVE">Active</option>
                        <option value="INACTIVE">Inactive</option>
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Standard Form Actions */}
              <FormActions align="end">
                <FormCancelButton
                  onCancel={() => guardedOnOpenChange(false)}
                  isPending={isPending}
                />
                <FormSubmitButton isPending={isPending} loadingText="Creating User...">
                  Create Account
                </FormSubmitButton>
              </FormActions>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Discard Confirmation Modal */}
      <ConfirmDiscardDialog
        open={isConfirmOpen}
        onConfirm={confirmDiscard}
        onCancel={cancelDiscard}
      />
    </>
  );
};

UserFormDialog.displayName = 'UserFormDialog';
