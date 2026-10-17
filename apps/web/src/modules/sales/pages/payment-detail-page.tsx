import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, Button } from '@kinergy-platform/ui';
import { ArrowLeft, CheckCircle2, XCircle, ShoppingBag, AlertCircle } from 'lucide-react';
import { usePaymentDetail } from '../hooks/use-sales-queries';
import { useSettlePayment, useCancelPayment } from '../hooks/use-sales-mutations';
import { PaymentStatusBadge } from '../components/payment-status-badge';
import { PaymentMethodBadge } from '../components/payment-method-badge';
import { MoneyDisplay } from '../components/money-display';
import { HasPermission } from '../../../app/routes/permission-guard';

export const PaymentDetailPage: React.FC = () => {
  const { paymentId } = useParams<{ paymentId: string }>();

  const { data: payment, isLoading, isError } = usePaymentDetail(paymentId);
  const settleMutation = useSettlePayment();
  const cancelMutation = useCancelPayment();

  if (isLoading) {
    return (
      <div className="p-8 text-center text-muted-foreground" data-testid="payment-detail-loading">
        Loading payment transaction...
      </div>
    );
  }

  if (isError || !payment) {
    return (
      <div
        className="p-8 text-center text-destructive space-y-3"
        data-testid="payment-detail-error"
      >
        <AlertCircle className="h-8 w-8 mx-auto" />
        <h2 className="text-lg font-semibold">Payment Transaction Not Found</h2>
        <p className="text-sm text-muted-foreground">
          Payment transaction &ldquo;{paymentId}&rdquo; does not exist or you lack permission to
          view it.
        </p>
        <Button asChild variant="outline">
          <Link to="/sales/payments">Return to Payments History</Link>
        </Button>
      </div>
    );
  }

  const isPending = payment.status === 'PENDING';

  const handleSettle = async () => {
    await settleMutation.mutateAsync({ paymentId: payment.id });
  };

  const handleCancel = async () => {
    await cancelMutation.mutateAsync({
      paymentId: payment.id,
      input: { reason: 'Voided by cashier' },
    });
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto" data-testid="payment-detail-page">
      {/* Header Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/sales/payments">
              <ArrowLeft className="h-4 w-4 mr-1" /> Payments History
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold font-mono tracking-tight">{payment.id}</h1>
              <PaymentStatusBadge status={payment.status} />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Recorded {new Date(payment.createdAt).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Action Triggers */}
        {isPending && (
          <HasPermission name="payments.manage">
            <div className="flex items-center gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={handleSettle}
                disabled={settleMutation.isPending}
                className="gap-1.5"
              >
                <CheckCircle2 className="h-4 w-4" /> Confirm Settlement
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleCancel}
                disabled={cancelMutation.isPending}
                className="gap-1.5"
              >
                <XCircle className="h-4 w-4" /> Cancel Tender
              </Button>
            </div>
          </HasPermission>
        )}
      </div>

      {/* Payment Details Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transaction Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground block text-xs">Tender Method</span>
              <div className="mt-1">
                <PaymentMethodBadge method={payment.method} />
              </div>
            </div>

            <div>
              <span className="text-muted-foreground block text-xs">Tender Amount</span>
              <div className="mt-1 text-lg font-bold font-mono">
                <MoneyDisplay value={payment.amount} />
              </div>
            </div>

            <div>
              <span className="text-muted-foreground block text-xs">Associated Sale Order</span>
              <Link
                to={`/sales/${payment.saleId}`}
                className="mt-1 inline-flex items-center gap-1 font-mono text-sm text-primary hover:underline"
              >
                <ShoppingBag className="h-3.5 w-3.5" /> {payment.saleId}
              </Link>
            </div>

            <div>
              <span className="text-muted-foreground block text-xs">Settlement Timestamp</span>
              <span className="mt-1 block text-sm">
                {payment.paidAt ? new Date(payment.paidAt).toLocaleString() : 'Unsettled / Pending'}
              </span>
            </div>

            <div className="col-span-2">
              <span className="text-muted-foreground block text-xs">
                Audit Reference / Trace Tag
              </span>
              <span className="mt-1 font-mono text-xs block text-muted-foreground">
                {payment.reference || 'None specified'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
