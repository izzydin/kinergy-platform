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
import { AlertTriangle } from 'lucide-react';
import React from 'react';
import { useNotification } from '../../../../app/providers/notification-provider';
import { usePlanMutations } from '../hooks/use-plans';
import type { MembershipPlanVM } from '../types';

export interface ArchivePlanDialogProps {
  readonly plan: MembershipPlanVM | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export const ArchivePlanDialog: React.FC<ArchivePlanDialogProps> = ({
  plan,
  open,
  onOpenChange,
}) => {
  const { archivePlan } = usePlanMutations();
  const { success, error: notifyError } = useNotification();

  const handleConfirmArchive = () => {
    if (!plan) return;

    archivePlan.mutate(plan.id, {
      onSuccess: (archived) => {
        success('Plan Archived', `Plan "${archived.name}" has been moved to ARCHIVED status.`);
        onOpenChange(false);
      },
      onError: (err) => {
        notifyError(err, 'Failed to archive membership plan');
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="archive-plan-dialog">
        <DialogHeader>
          <DialogTitle>Archive Membership Plan</DialogTitle>
          <DialogDescription>
            Are you sure you want to archive{' '}
            <span className="font-semibold text-foreground">{plan?.name}</span> ({plan?.code})?
          </DialogDescription>
        </DialogHeader>

        <Alert className="bg-amber-50/70 border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Commercial Catalog Impact</AlertTitle>
          <AlertDescription className="text-xs">
            Archiving removes this plan from future sales and client membership onboarding. Existing
            active memberships under this plan will continue running uninterrupted.
          </AlertDescription>
        </Alert>

        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={archivePlan.isPending}
            data-testid="cancel-archive-plan-button"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirmArchive}
            disabled={archivePlan.isPending}
            data-testid="confirm-archive-plan-button"
          >
            {archivePlan.isPending ? 'Archiving...' : 'Archive Plan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

ArchivePlanDialog.displayName = 'ArchivePlanDialog';
