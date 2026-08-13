import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from '@kinergy-platform/ui';
import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
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
 * React Hook Form owns form state, Zod owns validation, and TanStack Query owns server state.
 */
export const UserFormDialog: React.FC<UserFormDialogProps> = ({ open, onOpenChange }) => {
  const createUserMutation = useCreateUserMutation();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      email: '',
      name: '',
      role: 'MEMBER',
      status: 'ACTIVE',
    },
  });

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (!open) {
      reset();
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create User Account</DialogTitle>
          <DialogDescription>
            Add a new user account to the platform. Identity users manage platform authentication
            and access roles.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2" noValidate>
          {/* Email Field */}
          <div className="space-y-1.5">
            <label htmlFor="user-create-email" className="text-sm font-medium text-foreground">
              Email Address <span className="text-destructive">*</span>
            </label>
            <Input
              id="user-create-email"
              type="email"
              placeholder="user@example.com"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'user-create-email-error' : undefined}
              {...register('email')}
            />
            {errors.email && (
              <p id="user-create-email-error" className="text-xs font-medium text-destructive">
                {errors.email.message}
              </p>
            )}
          </div>

          {/* Display Name Field */}
          <div className="space-y-1.5">
            <label htmlFor="user-create-name" className="text-sm font-medium text-foreground">
              Full Name <span className="text-destructive">*</span>
            </label>
            <Input
              id="user-create-name"
              type="text"
              placeholder="Jane Doe"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'user-create-name-error' : undefined}
              {...register('name')}
            />
            {errors.name && (
              <p id="user-create-name-error" className="text-xs font-medium text-destructive">
                {errors.name.message}
              </p>
            )}
          </div>

          {/* Role Select Field */}
          <div className="space-y-1.5">
            <label htmlFor="user-create-role" className="text-sm font-medium text-foreground">
              Access Role <span className="text-destructive">*</span>
            </label>
            <select
              id="user-create-role"
              aria-invalid={Boolean(errors.role)}
              aria-describedby={errors.role ? 'user-create-role-error' : undefined}
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              {...register('role')}
            >
              <option value="MEMBER">Member</option>
              <option value="OPERATOR">Operator</option>
              <option value="ADMIN">Admin</option>
            </select>
            {errors.role && (
              <p id="user-create-role-error" className="text-xs font-medium text-destructive">
                {errors.role.message}
              </p>
            )}
          </div>

          {/* Status Select Field */}
          <div className="space-y-1.5">
            <label htmlFor="user-create-status" className="text-sm font-medium text-foreground">
              Initial Account Status
            </label>
            <select
              id="user-create-status"
              aria-invalid={Boolean(errors.status)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              {...register('status')}
            >
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>

          {/* Footer Actions */}
          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" variant="default" disabled={isPending}>
              {isPending ? 'Creating User...' : 'Create Account'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

UserFormDialog.displayName = 'UserFormDialog';
