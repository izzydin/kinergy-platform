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
} from '@kinergy-platform/ui';
import {
  Archive,
  ArrowLeft,
  Clock,
  DollarSign,
  Info,
  ShieldAlert,
  Tag,
  Upload,
} from 'lucide-react';
import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../../../app/providers/auth-provider';
import { useNotification } from '../../../../app/providers/notification-provider';
import { CrudError, CrudLoading } from '../../../../shared/crud';
import { ArchivePlanDialog } from '../components/archive-plan-dialog';
import { PlanStatusBadge } from '../components/plan-status-badge';
import { UpdatePricingDialog } from '../components/update-pricing-dialog';
import { usePlanDetail, usePlanMutations } from '../hooks/use-plans';

export const PlanDetailPage: React.FC = () => {
  const { planId = '' } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const { hasPermission, hasRole } = useAuth();
  const { success, error: notifyError } = useNotification();
  const canManagePlans = hasPermission('plans.update') || hasRole('ADMIN') || hasRole('OWNER');

  const [isPricingOpen, setIsPricingOpen] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);

  const { data: plan, isLoading, isError, error, refetch } = usePlanDetail(planId);
  const { publishPlan } = usePlanMutations();

  if (isLoading) {
    return <CrudLoading variant="detail" />;
  }

  if (isError || !plan) {
    return (
      <CrudError
        title="Plan Not Found"
        error={error?.message || 'The requested membership plan could not be located.'}
        onRetry={() => void refetch()}
        secondaryAction={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/gym/plans')}
            className="text-xs"
          >
            Back to Plans
          </Button>
        }
      />
    );
  }

  const isDraft = plan.status === 'DRAFT';
  const isActive = plan.status === 'ACTIVE';
  const isArchived = plan.status === 'ARCHIVED';

  const handlePublish = () => {
    publishPlan.mutate(plan.id, {
      onSuccess: (published) => {
        success('Plan Published', `Plan "${published.name}" is now ACTIVE for commercial sale.`);
      },
      onError: (err) => {
        notifyError(err, 'Failed to publish plan');
      },
    });
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6" data-testid="plan-detail-page">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => navigate('/gym/plans')}
          className="gap-1 text-xs text-muted-foreground hover:text-foreground"
          data-testid="back-to-plans-button"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Plans
        </Button>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {isDraft && canManagePlans && (
            <Button
              type="button"
              onClick={handlePublish}
              disabled={publishPlan.isPending}
              className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              data-testid="publish-plan-detail-button"
            >
              <Upload className="h-3.5 w-3.5" />
              {publishPlan.isPending ? 'Publishing...' : 'Publish Plan'}
            </Button>
          )}

          {!isArchived && canManagePlans && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsPricingOpen(true)}
              className="gap-1.5 text-xs"
              data-testid="edit-pricing-detail-button"
            >
              <DollarSign className="h-3.5 w-3.5" />
              Update Price
            </Button>
          )}

          {isActive && canManagePlans && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsArchiveOpen(true)}
              className="gap-1.5 text-xs text-destructive hover:bg-destructive/10"
              data-testid="archive-plan-detail-button"
            >
              <Archive className="h-3.5 w-3.5" />
              Archive Plan
            </Button>
          )}
        </div>
      </div>

      {/* Plan Header Card */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-2xl font-bold text-foreground">{plan.name}</CardTitle>
              <CardDescription className="font-mono text-xs text-muted-foreground mt-1">
                Code: {plan.code}
              </CardDescription>
            </div>
            <PlanStatusBadge
              status={plan.status}
              className="self-start sm:self-center text-sm px-3 py-1"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {plan.description && <p className="text-sm text-muted-foreground">{plan.description}</p>}

          {/* Pricing & Terms Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t">
            <div className="p-4 rounded-lg bg-muted/40 border space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5" />
                Commercial Price
              </span>
              <div className="text-2xl font-bold font-mono text-foreground">
                ${(plan.priceAmount / 100).toFixed(2)}{' '}
                <span className="text-xs font-normal text-muted-foreground font-sans">
                  {plan.priceCurrency}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Stored as {plan.priceAmount} cents
              </p>
            </div>

            <div className="p-4 rounded-lg bg-muted/40 border space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Duration
              </span>
              <div className="text-2xl font-bold text-foreground">
                {plan.durationInDays}{' '}
                <span className="text-xs font-normal text-muted-foreground">Days</span>
              </div>
              <p className="text-[11px] text-muted-foreground">Standard access window</p>
            </div>

            <div className="p-4 rounded-lg bg-muted/40 border space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5" />
                Visit Quota
              </span>
              <div className="text-2xl font-bold text-foreground">
                {plan.visitQuota ? plan.visitQuota : 'Unlimited'}
              </div>
              <p className="text-[11px] text-muted-foreground">Check-in ingress allowance</p>
            </div>
          </div>

          {/* Status Specific Notices */}
          {isDraft && (
            <Alert className="bg-amber-50/70 border-amber-200 text-amber-900 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-300">
              <Info className="h-4 w-4" />
              <AlertTitle>Draft Status</AlertTitle>
              <AlertDescription className="text-xs">
                This plan is in draft mode and cannot be selected when creating client memberships
                until it is published.
              </AlertDescription>
            </Alert>
          )}

          {isArchived && (
            <Alert className="bg-slate-100 border-slate-200 text-slate-800 dark:bg-slate-800/40 dark:border-slate-700 dark:text-slate-300">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>Archived Catalog Item</AlertTitle>
              <AlertDescription className="text-xs">
                This plan has been retired from active sales. Existing client memberships
                referencing this plan continue under their agreed terms.
              </AlertDescription>
            </Alert>
          )}

          {/* Audit Metadata */}
          <div className="pt-4 border-t text-xs text-muted-foreground flex flex-col sm:flex-row justify-between gap-2">
            <div>
              Created: {new Date(plan.createdAt).toLocaleString()} | Version: {plan.version}
            </div>
            <div>Updated: {new Date(plan.updatedAt).toLocaleString()}</div>
          </div>
        </CardContent>
      </Card>

      {/* Update Pricing Modal */}
      <UpdatePricingDialog plan={plan} open={isPricingOpen} onOpenChange={setIsPricingOpen} />

      {/* Archive Plan Modal */}
      <ArchivePlanDialog plan={plan} open={isArchiveOpen} onOpenChange={setIsArchiveOpen} />
    </div>
  );
};

PlanDetailPage.displayName = 'PlanDetailPage';
