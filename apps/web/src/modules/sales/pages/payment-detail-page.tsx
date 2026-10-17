import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
} from '@kinergy-platform/ui';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  ShoppingBag,
  AlertCircle,
  Receipt,
  Clock,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { usePaymentDetail } from '../hooks/use-sales-queries';
import { useSettlePayment, useCancelPayment } from '../hooks/use-sales-mutations';
import { PaymentStatusBadge } from '../components/payment-status-badge';
import { PaymentMethodBadge } from '../components/payment-method-badge';
import { MoneyDisplay } from '../components/money-display';
import { CancelPaymentDialog } from '../components/cancel-payment-dialog';
import { HasPermission } from '../../../app/routes/permission-guard';
import { useAuth } from '../../../app/providers/auth-provider';
import { ForbiddenView } from '../../../app/routes/fallback-views';
import { CrudLoading, CrudEmpty, CrudError } from '../../../shared/crud';
import { SALES_ROUTES } from '../routes/sales-routes';

export const PaymentDetailPage: React.FC = () => {
  const { paymentId } = useParams<{ paymentId: string }>();
  const auth = useAuth();

  // Permission check: payments.read
  const canRead = Boolean(
    typeof auth.hasPermission === 'function'
      ? auth.hasPermission('payments.read')
      : auth.currentUser?.permissions?.includes('payments.read'),
  );

  const { data: payment, isLoading, isError, error, refetch } = usePaymentDetail(paymentId);
  const settleMutation = useSettlePayment();
  const cancelMutation = useCancelPayment();
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);

  // Authorize settlement (payments.manage or payments.create) and cancellation (payments.manage exclusively)
  const canSettle = Boolean(
    typeof auth.hasPermission === 'function'
      ? auth.hasPermission('payments.manage') || auth.hasPermission('payments.create')
      : auth.currentUser?.permissions?.includes('payments.manage') ||
          auth.currentUser?.permissions?.includes('payments.create'),
  );

  const canCancel = Boolean(
    typeof auth.hasPermission === 'function'
      ? auth.hasPermission('payments.manage')
      : auth.currentUser?.permissions?.includes('payments.manage'),
  );

  if (!canRead) {
    return (
      <ForbiddenView message="Access Denied: Missing required permission 'payments.read' to inspect payment records." />
    );
  }

  if (isLoading && !payment) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-6" data-testid="payment-detail-loading">
        <CrudLoading variant="detail" />
      </div>
    );
  }

  // Distinguish 404 not-found from genuine server/network failure
  const statusError = error as unknown as
    { statusCode?: number; status?: number; response?: { status?: number } } | null | undefined;

  const isNotFound = Boolean(
    !payment &&
    (!isError ||
      statusError?.statusCode === 404 ||
      statusError?.status === 404 ||
      statusError?.response?.status === 404 ||
      error?.message?.toLowerCase().includes('not found')),
  );

  if (isError && !isNotFound) {
    return (
      <div className="p-8 max-w-xl mx-auto space-y-4" data-testid="payment-detail-error">
        <CrudError
          title="Failed to load payment transaction"
          error={error}
          onRetry={() => refetch()}
          secondaryAction={
            <Button asChild variant="outline" size="sm">
              <Link to={SALES_ROUTES.payments()}>
                <ArrowLeft className="h-4 w-4 mr-1.5" /> Return to Payments Log
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (isNotFound || !payment) {
    return (
      <div className="p-8 max-w-md mx-auto space-y-4" data-testid="payment-detail-error">
        <CrudEmpty
          title="Payment Record Not Found"
          description={`Payment transaction "${paymentId}" does not exist or you lack permission to view it.`}
          action={
            <Button asChild variant="outline" size="sm">
              <Link to={SALES_ROUTES.payments()}>
                <ArrowLeft className="h-4 w-4 mr-1.5" /> Return to Payments Log
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  const isPending = payment.status === 'PENDING';
  const isCompleted = payment.status === 'COMPLETED';
  const isCancelled = payment.status === 'CANCELLED';
  const isFailed = payment.status === 'FAILED';

  const handleSettle = async () => {
    if (settleMutation.isPending) return;
    await settleMutation.mutateAsync({ paymentId: payment.id });
  };

  const handleConfirmCancel = async (reason: string) => {
    await cancelMutation.mutateAsync({
      paymentId: payment.id,
      input: { reason },
    });
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto" data-testid="payment-detail-page">
      {/* 1. Header Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to={SALES_ROUTES.payments()}>
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Payments Log
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold font-mono tracking-tight" data-testid="payment-id">
                {payment.id}
              </h1>
              <PaymentStatusBadge status={payment.status} />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Recorded {new Date(payment.createdAt).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Action Triggers (Only supported lifecycle transitions) */}
        <div className="flex items-center gap-2">
          {isPending && (
            <div className="flex items-center gap-2">
              {canSettle && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleSettle}
                  disabled={settleMutation.isPending}
                  className="gap-1.5"
                  data-testid="settle-payment-btn"
                >
                  {settleMutation.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" /> Settling...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" /> Confirm Settlement
                    </>
                  )}
                </Button>
              )}
              {canCancel && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setIsCancelDialogOpen(true)}
                  disabled={cancelMutation.isPending}
                  className="gap-1.5"
                  data-testid="cancel-payment-btn"
                >
                  <XCircle className="h-4 w-4" /> Cancel Tender
                </Button>
              )}
            </div>
          )}

          {/* Link to Sale Receipt if payment is settled */}
          {isCompleted && (
            <HasPermission name="receipts.read">
              <Button
                asChild
                variant="outline"
                size="sm"
                className="gap-1.5"
                data-testid="payment-view-receipt-btn"
              >
                <Link to={SALES_ROUTES.receipt(payment.saleId)}>
                  <Receipt className="h-4 w-4" /> View Sale Receipt
                </Link>
              </Button>
            </HasPermission>
          )}
        </div>
      </div>

      {/* 2. Lifecycle Status Banner */}
      {isCompleted && (
        <div
          className="p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2.5"
          data-testid="payment-status-banner-completed"
        >
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>
            Payment tender confirmed and settled in internal sales aggregate ledger on{' '}
            <strong className="font-mono">
              {payment.paidAt ? new Date(payment.paidAt).toLocaleString() : 'N/A'}
            </strong>
            .
          </span>
        </div>
      )}

      {isPending && (
        <div
          className="p-3.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2.5"
          data-testid="payment-status-banner-pending"
        >
          <Clock className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            This payment tender is registered in <strong>PENDING</strong> status. Awaiting
            settlement confirmation or cashier verification.
          </span>
        </div>
      )}

      {isFailed && (
        <div
          className="p-3.5 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-xs flex items-center gap-2.5"
          data-testid="payment-status-banner-failed"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>This payment attempt failed during processing and did not settle.</span>
        </div>
      )}

      {isCancelled && (
        <div
          className="p-3.5 rounded-lg border border-muted-foreground/30 bg-muted text-muted-foreground text-xs flex items-center gap-2.5"
          data-testid="payment-status-banner-cancelled"
        >
          <XCircle className="h-4 w-4 shrink-0" />
          <span>
            This payment tender was cancelled or voided. No funds remain allocated to the order
            agreement.
          </span>
        </div>
      )}

      {/* 3. Authoritative Transaction Details Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transaction Details</CardTitle>
          <CardDescription className="text-xs">
            Financial breakdown and audit attributes returned authoritatively by the payment ledger
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground block text-xs">Tender Method</span>
              <div className="mt-1" data-testid="payment-method">
                <PaymentMethodBadge method={payment.method} />
              </div>
            </div>

            <div>
              <span className="text-muted-foreground block text-xs">Tender Amount</span>
              <div className="mt-1 text-lg font-bold font-mono" data-testid="payment-amount">
                <MoneyDisplay value={payment.amount} />
              </div>
            </div>

            <div>
              <span className="text-muted-foreground block text-xs">Associated Sale Agreement</span>
              <Link
                to={SALES_ROUTES.detail(payment.saleId)}
                className="mt-1 inline-flex items-center gap-1 font-mono text-sm text-primary hover:underline"
                data-testid="associated-sale-link"
              >
                <ShoppingBag className="h-3.5 w-3.5" /> {payment.saleId}
              </Link>
            </div>

            <div>
              <span className="text-muted-foreground block text-xs">Settlement Timestamp</span>
              <span className="mt-1 block text-sm" data-testid="payment-paid-at">
                {payment.paidAt ? new Date(payment.paidAt).toLocaleString() : 'Unsettled / Pending'}
              </span>
            </div>

            <div className="col-span-2 pt-2 border-t border-border">
              <span className="text-muted-foreground block text-xs">
                Audit Drawer Reference / Gateway Trace Tag
              </span>
              <span
                className="mt-1 font-mono text-xs block text-foreground"
                data-testid="payment-reference"
              >
                {payment.reference || 'None specified'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Dialog for Irreversible Payment Tender Cancellation */}
      <CancelPaymentDialog
        open={isCancelDialogOpen}
        onOpenChange={setIsCancelDialogOpen}
        paymentId={payment.id}
        amountFormatted={payment.amount?.formatted}
        isSubmitting={cancelMutation.isPending}
        onConfirm={handleConfirmCancel}
      />
    </div>
  );
};
