import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
} from '@kinergy-platform/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  DollarSign,
  ShieldCheck,
  Tag,
  UserCheck,
} from 'lucide-react';
import React, { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../../../../app/providers/notification-provider';
import {
  ConfirmDiscardDialog,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormValidationSummary,
  useDirtyGuard,
} from '../../../../shared/forms';
import { usePlans } from '../../plans/hooks/use-plans';
import { useMembershipEligibility, useMembershipMutations } from '../hooks/use-memberships';
import { createMembershipSchema, CreateMembershipFormValues } from '../schemas/membership.schema';

export const CreateMembershipPage: React.FC = () => {
  const navigate = useNavigate();
  const { success, error: notifyError } = useNotification();
  const { createMembership } = useMembershipMutations();

  // 1. Fetch only selectable/available plans directly from authoritative API
  const { data: plansData, isLoading: isLoadingPlans } = usePlans({
    activeOnly: true,
    limit: 50,
  });

  const availablePlans = useMemo(() => plansData?.items ?? [], [plansData]);

  const form = useForm<CreateMembershipFormValues>({
    resolver: zodResolver(createMembershipSchema),
    defaultValues: {
      clientId: '',
      planId: '',
      startDate: undefined,
      assignedTrainerId: '',
    },
    mode: 'onTouched',
  });

  const selectedPlanId = form.watch('planId');
  const watchedClientId = form.watch('clientId');

  // Authoritative server commercial info for the selected plan
  const selectedPlan = useMemo(
    () => availablePlans.find((p) => p.id === selectedPlanId),
    [availablePlans, selectedPlanId],
  );

  // Optional server eligibility preview evaluation
  const { data: eligibilityData } = useMembershipEligibility(watchedClientId?.trim());

  // Unsaved changes guard
  const { isBlocked, proceed, reset } = useDirtyGuard({
    isDirty: form.formState.isDirty,
    isSubmitSuccessful: form.formState.isSubmitSuccessful,
  });

  const onSubmit = (values: CreateMembershipFormValues) => {
    createMembership.mutate(
      {
        clientId: values.clientId.trim(),
        planId: values.planId.trim(),
        startDate: values.startDate ? new Date(values.startDate).toISOString() : undefined,
        assignedTrainerId: values.assignedTrainerId?.trim() || undefined,
      },
      {
        onSuccess: (created) => {
          success(
            'Membership Agreement Created',
            `Created agreement for client ${created.clientId} active through ${new Date(created.period.endDate).toLocaleDateString()}.`,
          );
          navigate(`/gym/memberships/${encodeURIComponent(created.id)}`);
        },
        onError: (err) => {
          notifyError(err, 'Failed to create membership agreement');
        },
      },
    );
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6" data-testid="create-membership-page">
      {/* Top Header & Breadcrumb */}
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => navigate('/gym/memberships')}
          className="gap-1 text-xs text-muted-foreground hover:text-foreground"
          data-testid="back-to-memberships-button"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Memberships
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-foreground">
            New Client Membership Agreement
          </CardTitle>
          <CardDescription>
            Onboard a registered client to an active commercial membership plan. The server will
            calculate and record the authoritative validity period and financial agreement.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormValidationSummary />

              {/* Step 1: Select Client */}
              <div className="p-4 rounded-lg border bg-muted/20 space-y-4">
                <h3 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                  <UserCheck className="h-4 w-4 text-primary" />
                  1. Client Information
                </h3>

                <FormField
                  control={form.control}
                  name="clientId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>Client ID</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="e.g. cli_01j7h8v9w..."
                          className="font-mono text-sm"
                          data-testid="input-client-id"
                        />
                      </FormControl>
                      <FormDescription>
                        Enter the unique identifier of the registered platform client.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Server-derived Eligibility Preview */}
                {eligibilityData && watchedClientId && (
                  <Alert
                    className={`text-xs py-2 ${
                      eligibilityData.isEligible
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/20 dark:border-emerald-800 dark:text-emerald-300'
                        : 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-300'
                    }`}
                    data-testid="client-eligibility-preview"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    <AlertTitle className="text-xs font-semibold">
                      Current Eligibility Status: {eligibilityData.outcome}
                    </AlertTitle>
                    <AlertDescription className="text-[11px] mt-0.5">
                      {eligibilityData.reason}
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              {/* Step 2: Select Plan */}
              <div className="p-4 rounded-lg border bg-muted/20 space-y-4">
                <h3 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                  <Tag className="h-4 w-4 text-primary" />
                  2. Select Commercial Plan
                </h3>

                <FormField
                  control={form.control}
                  name="planId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>Membership Plan</FormLabel>
                      <FormControl>
                        <select
                          {...field}
                          value={field.value ?? ''}
                          className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          data-testid="select-plan-id"
                          disabled={isLoadingPlans}
                        >
                          <option value="">
                            {isLoadingPlans
                              ? 'Loading available plans...'
                              : 'Select an active plan...'}
                          </option>
                          {availablePlans.map((plan) => (
                            <option key={plan.id} value={plan.id}>
                              {plan.name} ({plan.code}) — ${(plan.priceAmount / 100).toFixed(2)}{' '}
                              {plan.priceCurrency} / {plan.durationInDays} days
                            </option>
                          ))}
                        </select>
                      </FormControl>
                      <FormDescription>
                        Only plans published to ACTIVE status by the API are available for
                        onboarding.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Step 3: Server-Derived Commercial Information Display */}
                {selectedPlan && (
                  <div
                    className="p-3 bg-card border rounded-md grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs"
                    data-testid="server-derived-plan-info"
                  >
                    <div>
                      <span className="text-muted-foreground flex items-center gap-1">
                        <DollarSign className="h-3.5 w-3.5" />
                        Plan Price:
                      </span>
                      <span className="font-bold text-sm font-mono text-foreground">
                        ${(selectedPlan.priceAmount / 100).toFixed(2)} {selectedPlan.priceCurrency}
                      </span>
                    </div>

                    <div>
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        Plan Duration:
                      </span>
                      <span className="font-bold text-sm text-foreground">
                        {selectedPlan.durationInDays} Days
                      </span>
                    </div>

                    <div>
                      <span className="text-muted-foreground flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Visit Quota:
                      </span>
                      <span className="font-bold text-sm text-foreground">
                        {selectedPlan.visitQuota
                          ? `${selectedPlan.visitQuota} visits`
                          : 'Unlimited'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Step 4: Agreement Parameters */}
              <div className="p-4 rounded-lg border bg-muted/20 space-y-4">
                <h3 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                  <Clock className="h-4 w-4 text-primary" />
                  3. Agreement Parameters
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Date (Optional)</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            value={field.value ? field.value.split('T')[0] : ''}
                            onChange={(e) => {
                              const dateVal = e.target.value
                                ? new Date(e.target.value).toISOString()
                                : undefined;
                              field.onChange(dateVal);
                            }}
                            data-testid="input-start-date"
                          />
                        </FormControl>
                        <FormDescription>
                          Defaults to current time if unselected. The server calculates end date
                          upon creation.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="assignedTrainerId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Assigned Trainer ID (Optional)</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value ?? ''}
                            placeholder="e.g. usr_trainer01"
                            className="font-mono text-sm"
                            data-testid="input-assigned-trainer-id"
                          />
                        </FormControl>
                        <FormDescription>
                          Assign a dedicated personal trainer or coach to this subscription.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Form Action Controls */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/gym/memberships')}
                  disabled={createMembership.isPending}
                  data-testid="cancel-membership-creation-button"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMembership.isPending}
                  className="gap-2"
                  data-testid="submit-membership-button"
                >
                  {createMembership.isPending
                    ? 'Creating Agreement...'
                    : 'Create Membership Agreement'}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Discard changes guard dialog */}
      <ConfirmDiscardDialog open={isBlocked} onConfirm={proceed} onCancel={reset} />
    </div>
  );
};

CreateMembershipPage.displayName = 'CreateMembershipPage';
