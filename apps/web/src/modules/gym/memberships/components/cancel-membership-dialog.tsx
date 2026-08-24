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
  Input,
} from '@kinergy-platform/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertOctagon } from 'lucide-react';
import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNotification } from '../../../../app/providers/notification-provider';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormValidationSummary,
} from '../../../../shared/forms';
import { useMembershipMutations } from '../hooks/use-memberships';
import { cancelMembershipSchema, CancelMembershipFormValues } from '../schemas/membership.schema';
import type { MembershipVM } from '../types';

export interface CancelMembershipDialogProps {
  readonly membership: MembershipVM | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export const CancelMembershipDialog: React.FC<CancelMembershipDialogProps> = ({
  membership,
  open,
  onOpenChange,
}) => {
  const { cancelMembership } = useMembershipMutations();
  const { success, error: notifyError } = useNotification();

  const form = useForm<CancelMembershipFormValues>({
    resolver: zodResolver(cancelMembershipSchema),
    defaultValues: {
      reason: '',
    },
    mode: 'onTouched',
  });

  useEffect(() => {
    if (open) {
      form.reset({ reason: '' });
    }
  }, [open, form]);

  const onSubmit = (values: CancelMembershipFormValues) => {
    if (!membership) return;

    cancelMembership.mutate(
      {
        membershipId: membership.id,
        input: values,
      },
      {
        onSuccess: (updated) => {
          success(
            'Membership Cancelled',
            `Membership for client ${updated.clientId} has been terminated.`,
          );
          onOpenChange(false);
        },
        onError: (err) => {
          notifyError(err, 'Failed to cancel membership');
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="cancel-membership-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertOctagon className="h-5 w-5" />
            Terminate Membership Agreement
          </DialogTitle>
          <DialogDescription>
            Voluntarily cancel client{' '}
            <span className="font-mono text-foreground font-semibold">{membership?.clientId}</span>
            's membership agreement.
          </DialogDescription>
        </DialogHeader>

        <Alert className="bg-destructive/10 border-destructive/20 text-destructive dark:border-destructive/30">
          <AlertOctagon className="h-4 w-4" />
          <AlertTitle>Irreversible Termination</AlertTitle>
          <AlertDescription className="text-xs">
            Cancelling a membership immediately revokes facility access and terminates the
            agreement. This action cannot be undone.
          </AlertDescription>
        </Alert>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
            <FormValidationSummary />

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Termination Reason</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="e.g. Relocated out of state, client requested termination"
                      data-testid="input-cancel-reason"
                    />
                  </FormControl>
                  <FormDescription>
                    Required for operational record-keeping and audit compliance (minimum 3
                    characters).
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={cancelMembership.isPending}
                data-testid="abort-cancel-button"
              >
                Keep Active
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={cancelMembership.isPending}
                data-testid="confirm-cancel-button"
              >
                {cancelMembership.isPending ? 'Terminating...' : 'Terminate Agreement'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

CancelMembershipDialog.displayName = 'CancelMembershipDialog';
