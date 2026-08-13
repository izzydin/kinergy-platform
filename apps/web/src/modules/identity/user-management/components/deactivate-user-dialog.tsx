import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@kinergy-platform/ui';
import React from 'react';
import type { ManagedUser } from '../domain/user.types';

export interface DeactivateUserDialogProps {
  readonly user: ManagedUser | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: (user: ManagedUser) => void;
  readonly isDeactivating?: boolean;
}

/**
 * DeactivateUserDialog Component
 *
 * Accessible confirmation modal dialog for User Deactivation domain action.
 * Enforces explicit confirmation to prevent accidental revocation of user access.
 */
export const DeactivateUserDialog: React.FC<DeactivateUserDialogProps> = ({
  user,
  open,
  onOpenChange,
  onConfirm,
  isDeactivating = false,
}) => {
  if (!user) return null;

  const handleConfirm = () => {
    onConfirm(user);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Deactivate User Account</DialogTitle>
          <DialogDescription>
            Are you sure you want to deactivate the user account for{' '}
            <strong className="text-foreground font-semibold">{user.name}</strong> ({user.email})?
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
          <p className="font-semibold mb-1">Security Notice:</p>
          <p>
            Deactivating this account will immediately block future authentication attempts and
            terminate active user session permissions. You can reactivate this account at any time.
          </p>
        </div>

        <DialogFooter className="pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeactivating}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={isDeactivating}
          >
            {isDeactivating ? 'Deactivating...' : 'Deactivate User'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

DeactivateUserDialog.displayName = 'DeactivateUserDialog';
