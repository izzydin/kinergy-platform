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
  AlertOctagon,
  ArrowLeft,
  Calendar,
  History,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Tag,
  User,
} from 'lucide-react';
import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../../../app/providers/auth-provider';
import { CrudError, CrudLoading } from '../../../../shared/crud';
import { CancelMembershipDialog } from '../components/cancel-membership-dialog';
import { FreezeMembershipDialog } from '../components/freeze-membership-dialog';
import { MembershipStatusBadge } from '../components/membership-status-badge';
import { RenewMembershipDialog } from '../components/renew-membership-dialog';
import { UnfreezeMembershipDialog } from '../components/unfreeze-membership-dialog';
import { useMembershipDetail } from '../hooks/use-memberships';

export const MembershipDetailPage: React.FC = () => {
  const { membershipId = '' } = useParams<{ membershipId: string }>();
  const navigate = useNavigate();
  const { hasPermission, hasRole } = useAuth();
  const canManageMemberships =
    hasPermission('memberships.update') ||
    hasRole('ADMIN') ||
    hasRole('OWNER') ||
    hasRole('RECEPTIONIST');

  const [isRenewOpen, setIsRenewOpen] = useState(false);
  const [isFreezeOpen, setIsFreezeOpen] = useState(false);
  const [isUnfreezeOpen, setIsUnfreezeOpen] = useState(false);
  const [isCancelOpen, setIsCancelOpen] = useState(false);

  const {
    data: membership,
    isLoading,
    isError,
    error,
    refetch,
  } = useMembershipDetail(membershipId);

  if (isLoading) {
    return <CrudLoading variant="detail" />;
  }

  if (isError || !membership) {
    return (
      <CrudError
        title="Membership Not Found"
        error={error?.message || 'The requested membership agreement could not be located.'}
        onRetry={() => void refetch()}
        secondaryAction={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/gym/memberships')}
            className="text-xs"
          >
            Back to Memberships
          </Button>
        }
      />
    );
  }

  const isActive = membership.status === 'ACTIVE';
  const isFrozen = membership.status === 'FROZEN';
  const isExpired = membership.status === 'EXPIRED';
  const isCancelled = membership.status === 'CANCELLED';

  const now = new Date().getTime();
  const end = new Date(membership.period.endDate).getTime();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const isExpiringSoon = isActive && end > now && end - now <= sevenDaysMs;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6" data-testid="membership-detail-page">
      {/* Navigation & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => navigate('/gym/memberships')}
          className="gap-1 text-xs text-muted-foreground hover:text-foreground self-start"
          data-testid="back-to-memberships-button"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Memberships
        </Button>

        {/* Server-supported Lifecycle Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap" data-testid="membership-action-toolbar">
          {(isActive || isExpired) && canManageMemberships && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsRenewOpen(true)}
              className="gap-1.5 text-xs text-primary"
              data-testid="renew-detail-button"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Renew Agreement
            </Button>
          )}

          {isActive && canManageMemberships && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsFreezeOpen(true)}
              className="gap-1.5 text-xs text-sky-600 hover:text-sky-700"
              data-testid="freeze-detail-button"
            >
              <PauseCircle className="h-3.5 w-3.5" />
              Freeze / Suspend
            </Button>
          )}

          {isFrozen && canManageMemberships && (
            <Button
              type="button"
              size="sm"
              onClick={() => setIsUnfreezeOpen(true)}
              className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              data-testid="unfreeze-detail-button"
            >
              <PlayCircle className="h-3.5 w-3.5" />
              Resume Access
            </Button>
          )}

          {(isActive || isFrozen) && canManageMemberships && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsCancelOpen(true)}
              className="gap-1.5 text-xs text-destructive hover:bg-destructive/10"
              data-testid="cancel-detail-button"
            >
              <AlertOctagon className="h-3.5 w-3.5" />
              Cancel Agreement
            </Button>
          )}
        </div>
      </div>

      {/* Main Details Card */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-2xl font-bold text-foreground flex items-center gap-2">
                Membership Agreement
              </CardTitle>
              <CardDescription className="font-mono text-xs text-muted-foreground mt-1">
                ID: {membership.id}
              </CardDescription>
            </div>
            <MembershipStatusBadge
              status={membership.status}
              isExpiringSoon={isExpiringSoon}
              className="text-sm px-3 py-1 self-start sm:self-center"
            />
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Validity Period Summary Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t">
            <div className="p-4 rounded-lg bg-muted/40 border space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Agreement Period
              </span>
              <div className="text-sm font-semibold font-mono text-foreground">
                {new Date(membership.period.startDate).toLocaleDateString()} –{' '}
                {new Date(membership.period.endDate).toLocaleDateString()}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Total duration: {membership.period.durationDays} days
              </p>
            </div>

            <div className="p-4 rounded-lg bg-muted/40 border space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                Client Reference
              </span>
              <div className="text-sm font-mono font-bold text-foreground truncate">
                {membership.clientId}
              </div>
              {membership.assignedTrainerId ? (
                <p className="text-[11px] text-muted-foreground font-mono">
                  Trainer: {membership.assignedTrainerId}
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">No trainer assigned</p>
              )}
            </div>

            <div className="p-4 rounded-lg bg-muted/40 border space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5" />
                Plan Reference
              </span>
              <div className="text-sm font-mono font-bold text-foreground truncate">
                {membership.planId}
              </div>
              <p className="text-[11px] text-muted-foreground">Authoritative commercial plan</p>
            </div>
          </div>

          {/* Cancellation Notice if Cancelled */}
          {isCancelled && membership.cancellationReason && (
            <Alert className="bg-destructive/10 border-destructive/20 text-destructive dark:border-destructive/30">
              <AlertOctagon className="h-4 w-4" />
              <AlertTitle>Agreement Terminated</AlertTitle>
              <AlertDescription className="text-xs mt-1">
                Reason: {membership.cancellationReason}
              </AlertDescription>
            </Alert>
          )}

          {/* Freeze History Audit Trail */}
          {membership.freezeHistory && membership.freezeHistory.length > 0 && (
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <History className="h-4 w-4" />
                Suspension / Freeze History ({membership.freezeHistory.length})
              </h4>
              <div className="border rounded-md overflow-hidden bg-card text-xs">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Start
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">End</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Reason
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {membership.freezeHistory.map((item, idx) => (
                      <tr key={idx} data-testid={`freeze-history-row-${idx}`}>
                        <td className="px-3 py-2 font-mono">
                          {new Date(item.startDate).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-2 font-mono">
                          {new Date(item.endDate).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {item.reason || 'No reason provided'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Metadata Audit Footer */}
          <div className="pt-4 border-t text-xs text-muted-foreground flex flex-col sm:flex-row justify-between gap-2">
            <div>
              Created: {new Date(membership.createdAt).toLocaleString()} | Version:{' '}
              {membership.version}
            </div>
            <div>Updated: {new Date(membership.updatedAt).toLocaleString()}</div>
          </div>
        </CardContent>
      </Card>

      {/* Lifecycle Action Modals */}
      <RenewMembershipDialog
        membership={membership}
        open={isRenewOpen}
        onOpenChange={setIsRenewOpen}
      />

      <FreezeMembershipDialog
        membership={membership}
        open={isFreezeOpen}
        onOpenChange={setIsFreezeOpen}
      />

      <UnfreezeMembershipDialog
        membership={membership}
        open={isUnfreezeOpen}
        onOpenChange={setIsUnfreezeOpen}
      />

      <CancelMembershipDialog
        membership={membership}
        open={isCancelOpen}
        onOpenChange={setIsCancelOpen}
      />
    </div>
  );
};

MembershipDetailPage.displayName = 'MembershipDetailPage';
