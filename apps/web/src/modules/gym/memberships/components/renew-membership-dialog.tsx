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
import { CheckCircle2, RefreshCw } from 'lucide-react';
import React, { useEffect, useState } from 'react';
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
} from '../../../../shared/forms';
import { usePlans } from '../../plans/hooks/use-plans';
import { useMembershipMutations } from '../hooks/use-memberships';
import { renewMembershipSchema, RenewMembershipFormValues } from '../schemas/membership.schema';
import type { MembershipVM } from '../types';

export interface RenewMembershipDialogProps {
  readonly membership: MembershipVM | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export const RenewMembershipDialog: React.FC<RenewMembershipDialogProps> = ({
  membership,
  open,
  onOpenChange,
}) => {
  const { renewMembership } = useMembershipMutations();
  const { success, error: notifyError } = useNotification();
  const { data: plansData } = usePlans({ activeOnly: true, limit: 50 });
  const [renewedResult, setRenewedResult] = useState<MembershipVM | null>(null);

  const form = useForm<RenewMembershipFormValues>({
    resolver: zodResolver(renewMembershipSchema),
    defaultValues: {
      newPlanId: '',
      effectiveDate: undefined,
    },
  });

  useEffect(() => {
    if (open) {
      setRenewedResult(null);
      form.reset({
        newPlanId: '',
        effectiveDate: undefined,
      });
    }
  }, [open, form]);

  const onSubmit = (values: RenewMembershipFormValues) => {
    if (!membership) return;

    renewMembership.mutate(
      {
        membershipId: membership.id,
        input: {
          newPlanId: values.newPlanId?.trim() || undefined,
          effectiveDate: values.effectiveDate
            ? new Date(values.effectiveDate).toISOString()
            : undefined,
        },
      },
      {
        onSuccess: (result) => {
          setRenewedResult(result);
          success(
            'Membership Renewed',
            `Membership extended authoritatively to ${new Date(result.period.endDate).toLocaleDateString()}.`,
          );
        },
        onError: (err) => {
          notifyError(err, 'Failed to renew membership');
        },
      },
    );
  };

  const activePlans = plansData?.items ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="renew-membership-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" />
            Renew Membership Agreement
          </DialogTitle>
          <DialogDescription>
            Extend client{' '}
            <span className="font-mono text-foreground font-semibold">{membership?.clientId}</span>
            's agreement.
          </DialogDescription>
        </DialogHeader>

        {renewedResult ? (
          <div className="space-y-4 py-2" data-testid="renew-success-container">
            <Alert className="bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Renewal Successful</AlertTitle>
              <AlertDescription className="text-xs">
                The server has authoritatively recalculated the membership validity period.
              </AlertDescription>
            </Alert>

            <div className="p-4 rounded-lg bg-muted/40 border space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status:</span>
                <span className="font-semibold text-emerald-600">{renewedResult.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">New Start Date:</span>
                <span className="font-mono">
                  {new Date(renewedResult.period.startDate).toLocaleDateString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">New End Date:</span>
                <span className="font-mono font-bold text-foreground">
                  {new Date(renewedResult.period.endDate).toLocaleDateString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Duration:</span>
                <span className="font-medium">{renewedResult.period.durationDays} days</span>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                onClick={() => onOpenChange(false)}
                data-testid="close-renew-success-button"
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
              <div className="p-3 bg-muted/30 rounded border text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current End Date:</span>
                  <span className="font-mono font-semibold">
                    {membership?.period?.endDate
                      ? new Date(membership.period.endDate).toLocaleDateString()
                      : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current Plan:</span>
                  <span className="font-mono">{membership?.planId}</span>
                </div>
              </div>

              {/* Optional New Plan Selection */}
              <FormField
                control={form.control}
                name="newPlanId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Plan (Optional)</FormLabel>
                    <FormControl>
                      <select
                        {...field}
                        value={field.value ?? ''}
                        className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        data-testid="select-renew-plan"
                      >
                        <option value="">Keep current plan ({membership?.planId})</option>
                        {activePlans.map((plan) => (
                          <option key={plan.id} value={plan.id}>
                            {plan.name} (${(plan.priceAmount / 100).toFixed(2)} /{' '}
                            {plan.durationInDays} days)
                          </option>
                        ))}
                      </select>
                    </FormControl>
                    <FormDescription>
                      Select a new plan to upgrade/downgrade, or leave blank to renew existing
                      terms.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Optional Effective Date */}
              <FormField
                control={form.control}
                name="effectiveDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Effective Date (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        value={field.value ?? ''}
                        data-testid="input-renew-effective-date"
                      />
                    </FormControl>
                    <FormDescription>
                      Leave blank for seamless gapless extension from current expiration date.
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
                  disabled={renewMembership.isPending}
                  data-testid="cancel-renew-button"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={renewMembership.isPending}
                  data-testid="submit-renew-button"
                >
                  {renewMembership.isPending ? 'Renewing...' : 'Confirm Renewal'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
};

RenewMembershipDialog.displayName = 'RenewMembershipDialog';
