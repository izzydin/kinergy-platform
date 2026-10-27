import React, { useState } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Badge,
} from '@kinergy-platform/ui';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  CreditCard,
  Receipt,
  Tag,
  User,
  RefreshCw,
} from 'lucide-react';
import { useSaleDetail, useSalePayments, useReceiptBySale } from '../hooks/use-sales-queries';
import { useFinalizeSale, useCancelSale, useRecordPayment } from '../hooks/use-sales-mutations';
import { SaleStatusBadge } from '../components/sale-status-badge';
import { PaymentStatusBadge } from '../components/payment-status-badge';
import { PaymentMethodBadge } from '../components/payment-method-badge';
import { MoneyDisplay } from '../components/money-display';
import { CancelSaleDialog } from '../components/cancel-sale-dialog';
import { RecordPaymentDialog } from '../components/record-payment-dialog';
import { evaluateSaleBalances, centsToDecimal } from '../utils/financial-math';
import { HasPermission } from '../../../app/routes/permission-guard';
import { useAuth } from '../../../app/providers/auth-provider';
import { ForbiddenView } from '../../../app/routes/fallback-views';
import { CrudLoading, CrudEmpty, CrudError } from '../../../shared/crud';
import { SALES_ROUTES } from '../routes/sales-routes';
import type { PaymentMethod } from '../types';

export const SaleDetailPage: React.FC = () => {
  const { saleId } = useParams<{ saleId: string }>();
  const location = useLocation();
  const auth = useAuth();
  const backTo = (location.state as { from?: string } | null)?.from || SALES_ROUTES.list();

  // Top-level permission check: sales.read
  const canRead = Boolean(
    typeof auth.hasPermission === 'function'
      ? auth.hasPermission('sales.read')
      : auth.currentUser?.permissions?.includes('sales.read'),
  );

  const { data: sale, isLoading, isError, error, refetch } = useSaleDetail(saleId);
  const { data: payments } = useSalePayments(saleId);
  const { data: receipt } = useReceiptBySale(saleId);

  const finalizeMutation = useFinalizeSale();
  const cancelMutation = useCancelSale();
  const recordPaymentMutation = useRecordPayment();

  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [isRecordPaymentDialogOpen, setIsRecordPaymentDialogOpen] = useState(false);

  if (!canRead) {
    return (
      <ForbiddenView message="Access Denied: Missing required permission 'sales.read' to view sales agreements." />
    );
  }

  if (isLoading && !sale) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-6" data-testid="sale-detail-loading">
        <CrudLoading variant="detail" />
      </div>
    );
  }

  // Distinguish 404 not-found from genuine server/network failure
  const statusError = error as unknown as
    { statusCode?: number; status?: number; response?: { status?: number } } | null | undefined;

  const isNotFound = Boolean(
    !sale &&
    (!isError ||
      statusError?.statusCode === 404 ||
      statusError?.status === 404 ||
      statusError?.response?.status === 404 ||
      error?.message?.toLowerCase().includes('not found')),
  );

  if (isError && !isNotFound) {
    return (
      <div className="p-8 max-w-xl mx-auto space-y-4" data-testid="sale-detail-error">
        <CrudError
          title="Failed to load sale agreement"
          error={error}
          onRetry={() => refetch()}
          secondaryAction={
            <Button asChild variant="outline" size="sm">
              <Link to={backTo}>
                <ArrowLeft className="h-4 w-4 mr-1.5" /> Return to Directory
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (isNotFound || !sale) {
    return (
      <div className="p-8 max-w-md mx-auto space-y-4" data-testid="sale-detail-error">
        <CrudEmpty
          title="Sale Agreement Not Found"
          description={`Sale agreement "${saleId}" does not exist or you lack permission to view it.`}
          action={
            <Button asChild variant="outline" size="sm">
              <Link to={backTo}>
                <ArrowLeft className="h-4 w-4 mr-1.5" /> Return to Sales Directory
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  const isDraft = sale.status === 'DRAFT';
  const isPending = sale.status === 'PENDING_PAYMENT' || sale.status === 'PARTIALLY_PAID';
  const isSettled = sale.status === 'PAID' || sale.status === 'COMPLETED';
  const isCancelled = sale.status === 'CANCELLED';

  const balanceBreakdown = evaluateSaleBalances(sale, payments);
  const settledPaymentSum = centsToDecimal(balanceBreakdown.completedCents);
  const pendingPaymentSum = centsToDecimal(balanceBreakdown.pendingCents);
  const remainingBalance = balanceBreakdown.remainingBalance;

  const handleFinalize = async () => {
    if (finalizeMutation.isPending) return;
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

  const sourceRef =
    sale.sourceReference ||
    (sale.source
      ? {
          type: sale.source.sourceType,
          referenceId: sale.source.sourceId,
          referenceCode: sale.source.sourceCode || undefined,
        }
      : null);

  return (
    <div className="space-y-6 max-w-5xl mx-auto" data-testid="sale-detail-page">
      {/* 1. Header Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to={backTo}>
              <ArrowLeft className="h-4 w-4 mr-1.5" /> All Sales
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold font-mono tracking-tight" data-testid="sale-id">
                {sale.id}
              </h1>
              <SaleStatusBadge status={sale.status} />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Created {new Date(sale.createdAt).toLocaleString()} · Client:{' '}
              {sale.clientId ? (
                <span className="font-medium text-foreground">{sale.clientId}</span>
              ) : (
                <span className="italic">Anonymous Walk-in</span>
              )}
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
                data-testid="finalize-sale-btn"
              >
                {finalizeMutation.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" /> Finalizing...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" /> Finalize Agreement
                  </>
                )}
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
                data-testid="record-payment-btn"
              >
                <CreditCard className="h-4 w-4" /> Record Payment
              </Button>
            </HasPermission>
          )}

          {/* View Official Receipt Voucher (distinct from claim that receipt is already issued) */}
          {isSettled && (
            <HasPermission name="receipts.read">
              <Button
                asChild
                variant="outline"
                size="sm"
                className="gap-1.5"
                data-testid="view-receipt-btn"
              >
                <Link
                  to={SALES_ROUTES.receipt(sale.id)}
                  state={{ from: location.pathname + location.search }}
                >
                  <Receipt className="h-4 w-4" />
                  {receipt?.receiptNumber
                    ? `Receipt ${receipt.receiptNumber}`
                    : 'View Official Receipt'}
                </Link>
              </Button>
            </HasPermission>
          )}

          {/* Receipt Eligibility Indicators for Unsettled / Cancelled Orders */}
          {!isSettled && !isCancelled && (
            <Badge
              variant="outline"
              className="text-xs text-muted-foreground border-dashed"
              data-testid="receipt-eligibility-indicator"
            >
              <Receipt className="h-3 w-3 mr-1" />
              Receipt eligible after settlement
            </Badge>
          )}

          {isCancelled && (
            <Badge
              variant="outline"
              className="text-xs text-destructive/80 border-destructive/30"
              data-testid="receipt-ineligible-cancelled"
            >
              <XCircle className="h-3 w-3 mr-1" />
              Receipt ineligible (cancelled)
            </Badge>
          )}

          {/* Cancel Order Button */}
          {(isDraft || isPending) && (
            <HasPermission name="sales.cancel">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setIsCancelDialogOpen(true)}
                className="gap-1.5"
                data-testid="cancel-sale-btn"
              >
                <XCircle className="h-4 w-4" /> Cancel Order
              </Button>
            </HasPermission>
          )}
        </div>
      </div>

      {/* 2. Cancellation Notice Banner if Cancelled */}
      {isCancelled && (
        <div
          className="p-4 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-sm space-y-1"
          data-testid="cancellation-notice"
        >
          <div className="font-semibold flex items-center gap-1.5">
            <XCircle className="h-4 w-4" /> Agreement Cancelled
          </div>
          <p className="text-xs">
            Reason:{' '}
            <span className="font-medium">{sale.cancellationReason || 'No reason specified'}</span>
          </p>
          <p className="text-[11px] text-muted-foreground">
            Cancelled on {sale.cancelledAt ? new Date(sale.cancelledAt).toLocaleString() : 'N/A'}
          </p>
        </div>
      )}

      {/* 3. Authoritative Financial Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Gross Subtotal */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Authoritative Subtotal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold font-mono" data-testid="sale-subtotal">
              <MoneyDisplay value={sale.subtotal} />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Sum of {sale.itemCount ?? 0} line item{(sale.itemCount ?? 0) === 1 ? '' : 's'}
            </p>
          </CardContent>
        </Card>

        {/* Total Discounts */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Total Order Discount
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400"
              data-testid="sale-discount"
            >
              <MoneyDisplay value={sale.discountTotal} />
            </div>
            {sale.orderDiscount ? (
              <p className="text-[11px] text-muted-foreground mt-1">
                {sale.orderDiscount.type === 'PERCENTAGE'
                  ? `${sale.orderDiscount.value}% order-level discount`
                  : `${sale.currency} ${sale.orderDiscount.value.toFixed(2)} fixed discount`}{' '}
                ({sale.orderDiscount.reason || 'Standard promotion'})
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground mt-1">
                No order-level discount applied
              </p>
            )}
          </CardContent>
        </Card>

        {/* Net Total */}
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-primary font-medium uppercase tracking-wider">
              Net Payable Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-primary" data-testid="sale-total">
              <MoneyDisplay value={sale.total} />
            </div>
            {isPending && (
              <div className="mt-2 pt-2 border-t border-primary/20 space-y-1 text-xs">
                <div className="flex justify-between text-muted-foreground">
                  <span>Settled Tenders:</span>
                  <span className="font-mono">
                    {sale.currency} {settledPaymentSum.toFixed(2)}
                  </span>
                </div>
                {balanceBreakdown.hasPendingTenders && (
                  <div className="flex justify-between text-amber-600 dark:text-amber-400">
                    <span>Pending Settlement:</span>
                    <span className="font-mono">
                      {sale.currency} {pendingPaymentSum.toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-foreground pt-1 border-t border-border/50">
                  <span>Remaining Balance:</span>
                  <span className="font-mono">
                    {sale.currency} {remainingBalance.toFixed(2)}
                  </span>
                </div>
                <div className="pt-1">
                  {balanceBreakdown.isPaidInFull ? (
                    <Badge
                      variant="outline"
                      className="text-[10px] text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800"
                    >
                      PAID IN FULL (Zero Balance)
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-[10px] text-amber-700 bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800"
                    >
                      OUTSTANDING BALANCE ({sale.currency} {remainingBalance.toFixed(2)})
                    </Badge>
                  )}
                </div>
              </div>
            )}
            {isSettled && (
              <div className="mt-2 pt-2 border-t border-primary/20 space-y-1">
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                  Agreement fully paid and settled
                </p>
                <Badge
                  variant="outline"
                  className="text-[10px] text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800"
                >
                  PAID IN FULL (Zero Balance)
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 4. Commercial Origin Source & Customer Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Origin Source Reference */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Tag className="h-4 w-4 text-primary" />
              Origin Source Reference
            </CardTitle>
            <CardDescription className="text-xs">
              Commercial source tracking and upstream catalog link
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {sourceRef ? (
              <div
                className="grid grid-cols-2 gap-2 p-3 rounded-lg border border-border bg-muted/20"
                data-testid="sale-source-info"
              >
                <div>
                  <span className="text-muted-foreground block text-[11px]">Source Type</span>
                  <Badge variant="outline" className="mt-0.5 font-mono text-[11px]">
                    {sourceRef.type}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Reference ID</span>
                  <span
                    className="font-mono font-medium block mt-0.5 truncate"
                    title={sourceRef.referenceId}
                  >
                    {sourceRef.referenceId}
                  </span>
                </div>
                {sourceRef.referenceCode && (
                  <div className="col-span-2 pt-1 border-t border-border/50">
                    <span className="text-muted-foreground block text-[11px]">
                      Reference / Order Code
                    </span>
                    <span className="font-mono text-muted-foreground">
                      {sourceRef.referenceCode}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div
                className="p-3 rounded-lg border border-border bg-muted/10 text-muted-foreground"
                data-testid="sale-source-none"
              >
                <p className="font-medium text-foreground">Direct Walk-in / POS Session</p>
                <p className="text-[11px] mt-0.5">
                  This checkout session does not originate from an upstream catalog entity.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Customer & Timestamp Audit Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              Customer & Lifecycle Audit
            </CardTitle>
            <CardDescription className="text-xs">
              Client identifier and transaction lifecycle timestamps
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="grid grid-cols-2 gap-2 p-3 rounded-lg border border-border bg-muted/20">
              <div>
                <span className="text-muted-foreground block text-[11px]">Client Record</span>
                <span
                  className="font-medium text-foreground block mt-0.5"
                  data-testid="sale-client-info"
                >
                  {sale.clientId ? sale.clientId : 'Anonymous Walk-in Customer'}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Operating Currency</span>
                <span className="font-mono font-bold block mt-0.5">{sale.currency}</span>
              </div>
              <div className="pt-1 border-t border-border/50">
                <span className="text-muted-foreground block text-[11px]">Created At</span>
                <span className="text-muted-foreground">
                  {new Date(sale.createdAt).toLocaleString()}
                </span>
              </div>
              <div className="pt-1 border-t border-border/50">
                <span className="text-muted-foreground block text-[11px]">Last Updated</span>
                <span className="text-muted-foreground">
                  {new Date(sale.updatedAt).toLocaleString()}
                </span>
              </div>
              {sale.completedAt && (
                <div className="col-span-2 pt-1 border-t border-border/50">
                  <span className="text-muted-foreground block text-[11px]">Completed At</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                    {new Date(sale.completedAt).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 5. Authoritative Line Items Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Order Line Items ({sale.itemCount ?? sale.items?.length ?? 0})
          </CardTitle>
          <CardDescription className="text-xs">
            Line item subtotals and discounts authoritatively evaluated by the sales domain
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table
              className="w-full text-sm text-left"
              data-testid="sale-line-items-table"
              aria-label="Order line items"
            >
              <thead className="bg-muted/40 text-xs font-medium text-muted-foreground uppercase border-b border-border">
                <tr>
                  <th scope="col" className="px-4 py-2.5">
                    Category
                  </th>
                  <th scope="col" className="px-4 py-2.5">
                    Description
                  </th>
                  <th scope="col" className="px-4 py-2.5">
                    SKU / Code
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right">
                    Unit Price
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-center">
                    Qty
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right">
                    Discount
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {!sale.items || sale.items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-xs text-muted-foreground"
                      data-testid="no-items-msg"
                    >
                      No line items in this commercial agreement.
                    </td>
                  </tr>
                ) : (
                  (sale.items ?? []).map((item, idx) => (
                    <tr
                      key={item.id}
                      className="hover:bg-muted/20"
                      data-testid={`sale-item-row-${idx}`}
                    >
                      <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">
                        {item.sourceType}
                      </td>
                      <td className="px-4 py-2.5 font-medium">{item.description}</td>
                      <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">
                        {item.skuOrCode || '—'}
                      </td>
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
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 6. Payment Tenders History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tender Payments Recorded</CardTitle>
          <CardDescription className="text-xs">
            Audit trail of payment tenders registered against this order agreement
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!payments || payments.length === 0 ? (
            <p
              className="text-sm text-muted-foreground text-center py-6"
              data-testid="no-payments-msg"
            >
              No payment tenders registered for this order yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table
                className="w-full text-sm text-left"
                data-testid="sale-payments-table"
                aria-label="Payment tenders recorded"
              >
                <thead className="bg-muted/40 text-xs font-medium text-muted-foreground uppercase border-b border-border">
                  <tr>
                    <th scope="col" className="px-4 py-2.5">
                      Payment ID
                    </th>
                    <th scope="col" className="px-4 py-2.5">
                      Method
                    </th>
                    <th scope="col" className="px-4 py-2.5">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-2.5">
                      Reference
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right">
                      Amount
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {payments.map((p) => (
                    <tr
                      key={p.id}
                      className="hover:bg-muted/20"
                      data-testid={`payment-row-${p.id}`}
                    >
                      <td className="px-4 py-2.5 font-mono text-xs">
                        <Link
                          to={SALES_ROUTES.paymentDetail(p.id)}
                          state={{ from: location.pathname + location.search }}
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
                          <Link
                            to={SALES_ROUTES.paymentDetail(p.id)}
                            state={{ from: location.pathname + location.search }}
                            aria-label={`Inspect payment tender ${p.id}`}
                          >
                            Inspect
                          </Link>
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
