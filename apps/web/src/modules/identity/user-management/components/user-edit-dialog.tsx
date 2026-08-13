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
 * React Hook Form owns form state, Zod owns validation, and TanStack Query owns server state.
 */
export const UserEditDialog: React.FC<UserEditDialogProps> = ({ user, open, onOpenChange }) => {
  const updateUserMutation = useUpdateUserMutation();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UpdateUserFormValues>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: {
      name: user?.name ?? '',
      role: user?.roles[0] as UserRole | undefined,
    },
  });

  // Pre-fill form values whenever the selected target user changes
  useEffect(() => {
    if (user && open) {
      reset({
        name: user.name,
        role: user.roles[0] as UserRole | undefined,
      });
    } else if (!open) {
      reset();
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit User Profile</DialogTitle>
          <DialogDescription>
            Update user identity details and platform access role assignment.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2" noValidate>
          {/* Read-Only Email Display */}
          <div className="space-y-1.5">
            <label htmlFor="user-edit-email" className="text-sm font-medium text-foreground">
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

          {/* Display Name Field */}
          <div className="space-y-1.5">
            <label htmlFor="user-edit-name" className="text-sm font-medium text-foreground">
              Full Name
            </label>
            <Input
              id="user-edit-name"
              type="text"
              placeholder="Jane Doe"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'user-edit-name-error' : undefined}
              {...register('name')}
            />
            {errors.name && (
              <p id="user-edit-name-error" className="text-xs font-medium text-destructive">
                {errors.name.message}
              </p>
            )}
          </div>

          {/* Role Select Field */}
          <div className="space-y-1.5">
            <label htmlFor="user-edit-role" className="text-sm font-medium text-foreground">
              Access Role
            </label>
            <select
              id="user-edit-role"
              aria-invalid={Boolean(errors.role)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              {...register('role')}
            >
              <option value="MEMBER">Member</option>
              <option value="OPERATOR">Operator</option>
              <option value="ADMIN">Admin</option>
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
              {isPending ? 'Saving Changes...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

UserEditDialog.displayName = 'UserEditDialog';
