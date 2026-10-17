import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, Button } from '@kinergy-platform/ui';
import { ArrowLeft, CheckCircle2, XCircle, CreditCard, Receipt, AlertCircle } from 'lucide-react';
import { useSaleDetail, useSalePayments } from '../hooks/use-sales-queries';
import { useFinalizeSale, useCancelSale, useRecordPayment } from '../hooks/use-sales-mutations';
import { SaleStatusBadge } from '../components/sale-status-badge';
import { PaymentStatusBadge } from '../components/payment-status-badge';
import { PaymentMethodBadge } from '../components/payment-method-badge';
import { MoneyDisplay } from '../components/money-display';
import { CancelSaleDialog } from '../components/cancel-sale-dialog';
import { RecordPaymentDialog } from '../components/record-payment-dialog';
import { HasPermission } from '../../../app/routes/permission-guard';
import type { PaymentMethod } from '../types';

export const SaleDetailPage: React.FC = () => {
  const { saleId } = useParams<{ saleId: string }>();

  const { data: sale, isLoading, isError } = useSaleDetail(saleId);
  const { data: payments } = useSalePayments(saleId);

  const finalizeMutation = useFinalizeSale();
  const cancelMutation = useCancelSale();
  const recordPaymentMutation = useRecordPayment();

  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [isRecordPaymentDialogOpen, setIsRecordPaymentDialogOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="p-8 text-center text-muted-foreground" data-testid="sale-detail-loading">
        Loading commercial sale agreement...
      </div>
    );
  }

  if (isError || !sale) {
    return (
      <div className="p-8 text-center text-destructive space-y-3" data-testid="sale-detail-error">
        <AlertCircle className="h-8 w-8 mx-auto" />
        <h2 className="text-lg font-semibold">Sale Agreement Not Found</h2>
        <p className="text-sm text-muted-foreground">
          Sale order &ldquo;{saleId}&rdquo; does not exist or you lack permission to view it.
        </p>
        <Button asChild variant="outline">
          <Link to="/sales/list">Return to Sales Directory</Link>
        </Button>
      </div>
    );
  }

  const isDraft = sale.status === 'DRAFT';
  const isPending = sale.status === 'PENDING_PAYMENT' || sale.status === 'PARTIALLY_PAID';
  const isSettled = sale.status === 'PAID' || sale.status === 'COMPLETED';
  const isCancelled = sale.status === 'CANCELLED';

  const settledPaymentSum =
    payments?.filter((p) => p.status === 'COMPLETED').reduce((sum, p) => sum + p.amountValue, 0) ??
    0;

  const remainingBalance = Math.max(0, sale.totalAmount - settledPaymentSum);

  const handleFinalize = async () => {
    await finalizeMutation.mutateAsync(sale.id);
  };

  const handleConfirmCancel = async (reason: string) => {
    await cancelMutation.mutateAsync({
      saleId: sale.id,
      input: { reason },
    });
  };

  const handleRecordPayment = async (data: {
    method: PaymentMethod;
    amount: number;
    reference?: string;
  }) => {
    await recordPaymentMutation.mutateAsync({
      saleId: sale.id,
      input: {
        method: data.method,
        amount: data.amount,
        reference: data.reference,
      },
    });
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto" data-testid="sale-detail-page">
      {/* Header Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/sales/list">
              <ArrowLeft className="h-4 w-4 mr-1" /> All Sales
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold font-mono tracking-tight">{sale.id}</h1>
              <SaleStatusBadge status={sale.status} />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Created {new Date(sale.createdAt).toLocaleString()} · Client:{' '}
              {sale.clientId || 'Walk-in'}
            </p>
          </div>
        </div>

        {/* Action Triggers */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Finalize Button */}
          {isDraft && (
            <HasPermission name="sales.create">
              <Button
                variant="default"
                size="sm"
                onClick={handleFinalize}
                disabled={finalizeMutation.isPending}
                className="gap-1.5"
              >
                <CheckCircle2 className="h-4 w-4" /> Finalize Agreement
              </Button>
            </HasPermission>
          )}

          {/* Record Payment Button */}
          {isPending && (
            <HasPermission name="payments.create">
              <Button
                variant="default"
                size="sm"
                onClick={() => setIsRecordPaymentDialogOpen(true)}
                className="gap-1.5"
              >
                <CreditCard className="h-4 w-4" /> Record Payment
              </Button>
            </HasPermission>
          )}

          {/* View Receipt Voucher */}
          {isSettled && (
            <HasPermission name="receipts.read">
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link to={`/sales/${sale.id}/receipt`}>
                  <Receipt className="h-4 w-4" /> View Official Receipt
                </Link>
              </Button>
            </HasPermission>
          )}

          {/* Cancel Order Button */}
          {(isDraft || isPending) && (
            <HasPermission name="sales.cancel">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setIsCancelDialogOpen(true)}
                className="gap-1.5"
              >
                <XCircle className="h-4 w-4" /> Cancel Order
              </Button>
            </HasPermission>
          )}
        </div>
      </div>

      {/* Financial Summary & Breakdown Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Order Subtotal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold font-mono">
              <MoneyDisplay value={sale.subtotal} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Total Discount
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
              <MoneyDisplay value={sale.discountTotal} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-primary font-medium uppercase tracking-wider">
              Net Payable Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-primary">
              <MoneyDisplay value={sale.total} />
            </div>
            {isPending && (
              <p className="text-xs text-muted-foreground mt-1">
                Remaining: ${remainingBalance.toFixed(2)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cancellation Notice if Cancelled */}
      {isCancelled && (
        <div className="p-4 rounded-md border border-destructive/30 bg-destructive/10 text-destructive text-sm space-y-1">
          <div className="font-semibold flex items-center gap-1.5">
            <XCircle className="h-4 w-4" /> Order Cancelled
          </div>
          <p>Reason: {sale.cancellationReason || 'No reason specified'}</p>
          <p className="text-xs text-muted-foreground">
            Cancelled on {sale.cancelledAt ? new Date(sale.cancelledAt).toLocaleString() : 'N/A'}
          </p>
        </div>
      )}

      {/* Line Items Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Order Line Items ({sale.itemCount})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/40 text-xs font-medium text-muted-foreground uppercase border-b border-border">
                <tr>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Description</th>
                  <th className="px-4 py-2.5 text-right">Unit Price</th>
                  <th className="px-4 py-2.5 text-center">Qty</th>
                  <th className="px-4 py-2.5 text-right">Discount</th>
                  <th className="px-4 py-2.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sale.items.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">
                      {item.sourceType}
                    </td>
                    <td className="px-4 py-2.5 font-medium">{item.description}</td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      <MoneyDisplay value={item.unitPrice} />
                    </td>
                    <td className="px-4 py-2.5 text-center font-mono">{item.quantity}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-emerald-600 dark:text-emerald-400">
                      <MoneyDisplay value={item.discountTotal} />
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold">
                      <MoneyDisplay value={item.total} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Payment Tenders History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tender Payments Recorded</CardTitle>
        </CardHeader>
        <CardContent>
          {!payments || payments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No payment tenders registered for this order yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/40 text-xs font-medium text-muted-foreground uppercase border-b border-border">
                  <tr>
                    <th className="px-4 py-2.5">Payment ID</th>
                    <th className="px-4 py-2.5">Method</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Reference</th>
                    <th className="px-4 py-2.5 text-right">Amount</th>
                    <th className="px-4 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/20">
                      <td className="px-4 py-2.5 font-mono text-xs">
                        <Link
                          to={`/sales/payments/${p.id}`}
                          className="hover:underline text-primary"
                        >
                          {p.id}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <PaymentMethodBadge method={p.method} />
                      </td>
                      <td className="px-4 py-2.5">
                        <PaymentStatusBadge status={p.status} />
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                        {p.reference || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-medium">
                        <MoneyDisplay value={p.amount} />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button asChild variant="ghost" size="sm">
                          <Link to={`/sales/payments/${p.id}`}>Inspect</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modals */}
      <CancelSaleDialog
        open={isCancelDialogOpen}
        onOpenChange={setIsCancelDialogOpen}
        saleId={sale.id}
        isSubmitting={cancelMutation.isPending}
        onConfirm={handleConfirmCancel}
      />

      <RecordPaymentDialog
        open={isRecordPaymentDialogOpen}
        onOpenChange={setIsRecordPaymentDialogOpen}
        saleId={sale.id}
        defaultAmount={remainingBalance}
        currency={sale.currency}
        isSubmitting={recordPaymentMutation.isPending}
        onConfirm={handleRecordPayment}
      />
    </div>
  );
};
