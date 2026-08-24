import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@kinergy-platform/ui';
import { PlayCircle } from 'lucide-react';
import React from 'react';
import { useNotification } from '../../../../app/providers/notification-provider';
import { useMembershipMutations } from '../hooks/use-memberships';
import type { MembershipVM } from '../types';

export interface UnfreezeMembershipDialogProps {
  readonly membership: MembershipVM | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export const UnfreezeMembershipDialog: React.FC<UnfreezeMembershipDialogProps> = ({
  membership,
  open,
  onOpenChange,
}) => {
  const { unfreezeMembership } = useMembershipMutations();
  const { success, error: notifyError } = useNotification();

  const handleConfirmUnfreeze = () => {
    if (!membership) return;

    unfreezeMembership.mutate(membership.id, {
      onSuccess: (updated) => {
        success(
          'Membership Resumed',
          `Membership for client ${updated.clientId} is now ACTIVE with extended validity to ${new Date(updated.period.endDate).toLocaleDateString()}.`,
        );
        onOpenChange(false);
      },
      onError: (err) => {
        notifyError(err, 'Failed to unfreeze membership');
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="unfreeze-membership-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <PlayCircle className="h-5 w-5 text-emerald-500" />
            Resume / Unfreeze Membership
          </DialogTitle>
          <DialogDescription>
            Reactivate gym access for client{' '}
            <span className="font-mono text-foreground font-semibold">{membership?.clientId}</span>.
          </DialogDescription>
        </DialogHeader>

        <Alert className="bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/20 dark:border-emerald-800 dark:text-emerald-300">
          <PlayCircle className="h-4 w-4" />
          <AlertTitle>Validity Recalculation</AlertTitle>
          <AlertDescription className="text-xs">
            The server will calculate the exact days spent suspended and extend the agreement
            expiration date accordingly.
          </AlertDescription>
        </Alert>

        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={unfreezeMembership.isPending}
            data-testid="cancel-unfreeze-button"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirmUnfreeze}
            disabled={unfreezeMembership.isPending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            data-testid="confirm-unfreeze-button"
          >
            {unfreezeMembership.isPending ? 'Resuming...' : 'Confirm Resume'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

UnfreezeMembershipDialog.displayName = 'UnfreezeMembershipDialog';
