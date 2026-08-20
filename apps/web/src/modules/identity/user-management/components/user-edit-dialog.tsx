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
import { useUpdateUserMutation } from '../api/user-management-queries';
import type { ManagedUser, UserRole } from '../domain/user.types';
import { updateUserSchema, type UpdateUserFormValues } from '../schemas/user-form.schema';

export interface UserEditDialogProps {
  readonly user: ManagedUser | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * UserEditDialog Component
 *
 * Accessible modal dialog component for updating Identity User accounts.
 * Integrated with the C1 Form Framework (RHF, Zod, Form primitives, Validation Summary,
 * Dirty Dialog Guard, and FormActions).
 */
export const UserEditDialog: React.FC<UserEditDialogProps> = ({ user, open, onOpenChange }) => {
  const updateUserMutation = useUpdateUserMutation();

  const form = useForm<UpdateUserFormValues>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: {
      name: user?.name ?? '',
      role: user?.roles[0] as UserRole | undefined,
    },
  });

  const {
    handleSubmit,
    reset,
    setFocus,
    formState: { errors, isSubmitting, isSubmitted, isDirty, isSubmitSuccessful },
  } = form;

  // Protect unsaved changes when user attempts to close dialog
  const { guardedOnOpenChange, isConfirmOpen, confirmDiscard, cancelDiscard } = useDirtyDialogGuard(
    {
      isDirty,
      isSubmitSuccessful,
      onClose: () => onOpenChange(false),
    },
  );

  // Pre-fill form values whenever the selected target user changes
  useEffect(() => {
    if (user && open) {
      reset({
        name: user.name,
        role: user.roles[0] as UserRole | undefined,
      });
    } else if (!open) {
      reset({
        name: '',
        role: 'MEMBER',
      });
    }
  }, [user, open, reset]);

  const onSubmit = async (values: UpdateUserFormValues) => {
    if (!user) return;

    try {
      await updateUserMutation.mutateAsync({ userId: user.id, dto: values });
      reset();
      onOpenChange(false);
    } catch {
      // Error notification handled by mutation hook
    }
  };

  const isPending = isSubmitting || updateUserMutation.isPending;

  return (
    <>
      <Dialog open={open} onOpenChange={guardedOnOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User Profile</DialogTitle>
            <DialogDescription>
              Update user identity details and platform access role assignment.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2" noValidate>
              <FormValidationSummary
                errors={errors}
                isSubmitted={isSubmitted}
                setFocus={setFocus}
              />

              {/* Read-Only Email Display */}
              <div className="space-y-1.5">
                <label
                  htmlFor="user-edit-email"
                  className="block text-sm font-medium leading-none text-foreground select-none"
                >
                  Email Address (Read-Only)
                </label>
                <Input
                  id="user-edit-email"
                  type="email"
                  value={user?.email ?? ''}
                  disabled
                  readOnly
                  className="bg-muted cursor-not-allowed text-muted-foreground"
                />
              </div>

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

              {/* Standard Form Actions */}
              <FormActions align="end">
                <FormCancelButton
                  onCancel={() => guardedOnOpenChange(false)}
                  isPending={isPending}
                />
                <FormSubmitButton isPending={isPending} loadingText="Saving Changes...">
                  Save Changes
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

UserEditDialog.displayName = 'UserEditDialog';
