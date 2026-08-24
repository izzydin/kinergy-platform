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
import { PauseCircle, Snowflake } from 'lucide-react';
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
import { freezeMembershipSchema, FreezeMembershipFormValues } from '../schemas/membership.schema';
import type { MembershipVM } from '../types';

export interface FreezeMembershipDialogProps {
  readonly membership: MembershipVM | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export const FreezeMembershipDialog: React.FC<FreezeMembershipDialogProps> = ({
  membership,
  open,
  onOpenChange,
}) => {
  const { freezeMembership } = useMembershipMutations();
  const { success, error: notifyError } = useNotification();

  const form = useForm<FreezeMembershipFormValues>({
    resolver: zodResolver(freezeMembershipSchema),
    defaultValues: {
      startDate: '',
      endDate: '',
      reason: '',
    },
    mode: 'onTouched',
  });

  useEffect(() => {
    if (open) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const twoWeeksLater = new Date();
      twoWeeksLater.setDate(twoWeeksLater.getDate() + 15);

      form.reset({
        startDate: tomorrow.toISOString().split('T')[0] + 'T00:00:00.000Z',
        endDate: twoWeeksLater.toISOString().split('T')[0] + 'T00:00:00.000Z',
        reason: '',
      });
    }
  }, [open, form]);

  const onSubmit = (values: FreezeMembershipFormValues) => {
    if (!membership) return;

    freezeMembership.mutate(
      {
        membershipId: membership.id,
        input: values,
      },
      {
        onSuccess: (updated) => {
          success(
            'Membership Suspended',
            `Membership for client ${updated.clientId} is now suspended.`,
          );
          onOpenChange(false);
        },
        onError: (err) => {
          notifyError(err, 'Failed to freeze membership');
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="freeze-membership-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Snowflake className="h-5 w-5 text-sky-500" />
            Freeze / Suspend Membership
          </DialogTitle>
          <DialogDescription>
            Place a temporary freeze on client{' '}
            <span className="font-mono text-foreground font-semibold">{membership?.clientId}</span>
            's access agreement.
          </DialogDescription>
        </DialogHeader>

        <Alert className="bg-sky-50 border-sky-200 text-sky-900 dark:bg-sky-950/20 dark:border-sky-800 dark:text-sky-300">
          <PauseCircle className="h-4 w-4" />
          <AlertTitle>Suspension Invariants</AlertTitle>
          <AlertDescription className="text-xs">
            During the freeze window, gym access check-in eligibility is denied. When unfrozen, the
            membership validity period automatically extends by the frozen duration.
          </AlertDescription>
        </Alert>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
            <FormValidationSummary />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Freeze Start</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        value={field.value ? field.value.split('T')[0] : ''}
                        onChange={(e) => {
                          const dateVal = e.target.value
                            ? new Date(e.target.value).toISOString()
                            : '';
                          field.onChange(dateVal);
                        }}
                        data-testid="input-freeze-start-date"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Freeze End</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        value={field.value ? field.value.split('T')[0] : ''}
                        onChange={(e) => {
                          const dateVal = e.target.value
                            ? new Date(e.target.value).toISOString()
                            : '';
                          field.onChange(dateVal);
                        }}
                        data-testid="input-freeze-end-date"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ''}
                      placeholder="e.g. Travel, medical, injury recovery"
                      data-testid="input-freeze-reason"
                    />
                  </FormControl>
                  <FormDescription>
                    Logged in membership lifecycle history for audit compliance.
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
                disabled={freezeMembership.isPending}
                data-testid="cancel-freeze-button"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={freezeMembership.isPending}
                data-testid="submit-freeze-button"
              >
                {freezeMembership.isPending ? 'Freezing...' : 'Confirm Freeze'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

FreezeMembershipDialog.displayName = 'FreezeMembershipDialog';
