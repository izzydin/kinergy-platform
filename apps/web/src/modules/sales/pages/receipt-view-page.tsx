import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from '@kinergy-platform/ui';
import { ArrowLeft, Printer, CheckCircle2, RefreshCw } from 'lucide-react';
import { useReceiptBySale } from '../hooks/use-sales-queries';
import { useIssueReceipt } from '../hooks/use-sales-mutations';
import { MoneyDisplay } from '../components/money-display';
import { PaymentMethodBadge } from '../components/payment-method-badge';
import { HasPermission } from '../../../app/routes/permission-guard';
import { useAuth } from '../../../app/providers/auth-provider';
import { ForbiddenView } from '../../../app/routes/fallback-views';
import { CrudLoading, CrudEmpty, CrudError } from '../../../shared/crud';
import { SALES_ROUTES } from '../routes/sales-routes';

export const ReceiptViewPage: React.FC = () => {
  const { saleId } = useParams<{ saleId: string }>();
  const auth = useAuth();

  // Permission verification: receipts.read (or receipts.manage, sales.manage)
  const canRead = Boolean(
    typeof auth.hasPermission === 'function'
      ? auth.hasPermission('receipts.read')
      : auth.currentUser?.permissions?.includes('receipts.read'),
  );

  const { data: receipt, isLoading, isError, error, refetch } = useReceiptBySale(saleId);
  const issueReceiptMutation = useIssueReceipt();

  if (!canRead) {
    return (
      <ForbiddenView message="Access Denied: Missing required permission 'receipts.read' to view receipt vouchers." />
    );
  }

  const handleIssueReceipt = async () => {
    if (!saleId || issueReceiptMutation.isPending) return;
    await issueReceiptMutation.mutateAsync({ saleId });
    refetch();
  };

  const handlePrint = () => {
    window.print();
  };

  if (isLoading && !receipt) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-6" data-testid="receipt-view-loading">
        <CrudLoading variant="detail" />
      </div>
    );
  }

  // Distinguish expected 404 (receipt not yet issued for unsettled sale) from genuine 500 server failure
  const statusError = error as unknown as
    { statusCode?: number; status?: number; response?: { status?: number } } | null | undefined;

  const isNotFound = Boolean(
    !receipt &&
    (!isError ||
      statusError?.statusCode === 404 ||
      statusError?.status === 404 ||
      statusError?.response?.status === 404 ||
      error?.message?.toLowerCase().includes('not found') ||
      error?.message?.toLowerCase().includes('no receipt')),
  );

  if (isError && !isNotFound) {
    return (
      <div className="p-8 max-w-xl mx-auto space-y-4" data-testid="receipt-view-error">
        <CrudError
          title="Failed to Load Receipt Voucher"
          error={error}
          onRetry={() => refetch()}
          secondaryAction={
            saleId ? (
              <Button asChild variant="outline" size="sm">
                <Link to={SALES_ROUTES.detail(saleId)}>Return to Sale</Link>
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  // Not yet issued / unavailable
  if (isNotFound || !receipt) {
    return (
      <div className="p-8 max-w-lg mx-auto space-y-4" data-testid="receipt-not-issued">
        <CrudEmpty
          title="Receipt Not Issued Yet"
          description={`No official receipt voucher has been issued for sale "${saleId || 'unknown'}". In accordance with financial audit rules, official receipts are generated only after a sale order is fully settled.`}
          action={
            <div className="flex items-center justify-center gap-3 pt-2">
              {saleId && (
                <Button asChild variant="outline" size="sm">
                  <Link to={SALES_ROUTES.detail(saleId)}>
                    <ArrowLeft className="h-4 w-4 mr-1.5" /> Return to Sale
                  </Link>
                </Button>
              )}

              <HasPermission name="receipts.manage">
                <Button
                  onClick={handleIssueReceipt}
                  disabled={issueReceiptMutation.isPending}
                  size="sm"
                  className="gap-1.5"
                  data-testid="issue-receipt-btn"
                >
                  {issueReceiptMutation.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" /> Issuing Receipt...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" /> Generate Receipt Now
                    </>
                  )}
                </Button>
              </HasPermission>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div
      className="space-y-6 max-w-2xl mx-auto print:max-w-none print:m-0 print:p-0"
      data-testid="receipt-view-page"
    >
      {/* Action Navigation Bar (Hidden during print) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between no-print print:hidden">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to={SALES_ROUTES.detail(saleId || receipt.saleId)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to Sale
            </Link>
          </Button>
          <div>
            <h1
              className="text-xl font-bold tracking-tight text-foreground"
              data-testid="receipt-page-title"
            >
              Official Receipt Document
            </h1>
            <p className="text-xs text-muted-foreground">
              Read-only proof-of-payment voucher snapshotted upon full payment settlement
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="gap-1.5"
            data-testid="receipt-print-button"
          >
            <Printer className="h-4 w-4" /> Print Receipt
          </Button>
        </div>
      </div>

      {/* Printable Receipt Paper Card */}
      <Card className="border border-border shadow-sm print:border-none print:shadow-none bg-card">
        <CardHeader className="text-center border-b border-border pb-6 space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Badge variant="outline" className="text-xs uppercase tracking-wider">
              Official Proof of Purchase
            </Badge>
            {receipt.status && (
              <Badge variant="secondary" className="text-xs">
                {receipt.status}
              </Badge>
            )}
          </div>
          <CardTitle
            className="text-2xl font-bold font-mono tracking-tight"
            data-testid="receipt-number"
          >
            {receipt.receiptNumber}
          </CardTitle>
          <div className="text-xs text-muted-foreground space-y-0.5 font-mono">
            <div>Order Reference: {receipt.saleReference}</div>
            <div>Issued: {new Date(receipt.issuedAt).toLocaleString()}</div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-6">
          {/* Customer Snapshot */}
          <div
            className="text-xs space-y-1 pb-4 border-b border-border"
            data-testid="receipt-client-snapshot"
          >
            <span className="font-semibold text-muted-foreground uppercase tracking-wider block">
              Billed To
            </span>
            {receipt.clientSnapshot ? (
              <div className="font-medium text-sm">
                <div>{receipt.clientSnapshot.fullName}</div>
                {receipt.clientSnapshot.referenceNumber && (
                  <div className="text-xs text-muted-foreground font-mono">
                    Member #{receipt.clientSnapshot.referenceNumber}
                  </div>
                )}
                {receipt.clientSnapshot.email && (
                  <div className="text-xs text-muted-foreground">
                    {receipt.clientSnapshot.email}
                  </div>
                )}
                {receipt.clientSnapshot.phone && (
                  <div className="text-xs text-muted-foreground">
                    {receipt.clientSnapshot.phone}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-muted-foreground italic">Walk-in Customer</div>
            )}
          </div>

          {/* Line Items Table (Frozen Snapshot Preserved) */}
          <div className="space-y-2" data-testid="receipt-items-table">
            <span className="font-semibold text-xs text-muted-foreground uppercase tracking-wider block">
              Purchased Items
            </span>
            <table className="w-full text-xs" aria-label="Purchased items">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th scope="col" className="py-1.5 text-left font-medium">
                    Item Description
                  </th>
                  <th scope="col" className="py-1.5 text-center font-medium">
                    Qty
                  </th>
                  <th scope="col" className="py-1.5 text-right font-medium">
                    Unit Price
                  </th>
                  <th scope="col" className="py-1.5 text-right font-medium">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {receipt.items.map((item) => (
                  <tr key={item.itemId}>
                    <td className="py-2">
                      <div className="font-medium">{item.description}</div>
                      {item.skuOrCode && (
                        <div className="text-[10px] font-mono text-muted-foreground">
                          {item.skuOrCode}
                        </div>
                      )}
                    </td>
                    <td className="py-2 text-center font-mono">{item.quantity}</td>
                    <td className="py-2 text-right font-mono">
                      <MoneyDisplay value={item.unitPrice} />
                    </td>
                    <td className="py-2 text-right font-mono font-medium">
                      <MoneyDisplay value={item.total} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Monetary Totals Breakdown */}
          <div
            className="pt-4 border-t border-border space-y-1.5 text-xs"
            data-testid="receipt-totals-breakdown"
          >
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal:</span>
              <MoneyDisplay value={receipt.subtotal} />
            </div>

            {receipt.discountTotal.amount > 0 && (
              <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                <span>Total Discount Applied:</span>
                <span>
                  -<MoneyDisplay value={receipt.discountTotal} />
                </span>
              </div>
            )}

            <div className="flex justify-between text-base font-bold font-mono border-t border-border pt-2 text-foreground">
              <span>Total Paid ({receipt.currency}):</span>
              <MoneyDisplay value={receipt.total} />
            </div>
          </div>

          {/* Settled Tender Payments */}
          <div
            className="pt-4 border-t border-border space-y-2 text-xs"
            data-testid="receipt-payments-snapshot"
          >
            <span className="font-semibold text-muted-foreground uppercase tracking-wider block">
              Tender Settlement Records
            </span>
            {receipt.payments.map((p) => (
              <div
                key={p.paymentId}
                className="flex items-center justify-between py-1 bg-muted/20 px-2 rounded"
              >
                <div className="flex items-center gap-2">
                  <PaymentMethodBadge method={p.method} />
                  {p.reference && (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      Ref: {p.reference}
                    </span>
                  )}
                </div>
                <div className="font-mono font-medium">
                  <MoneyDisplay value={p.amount} />
                </div>
              </div>
            ))}
          </div>

          {/* Legal / Voucher Footer */}
          <div className="pt-6 border-t border-dashed border-border text-center text-[10px] text-muted-foreground space-y-1">
            <p>Thank you for your business at Kinergy Platform.</p>
            <p data-testid="receipt-audit-disclaimer">
              Official proof-of-purchase voucher snapshotted upon settlement. Viewing, downloading,
              or printing this document is strictly read-only and does not create, settle, or alter
              server payment records or transaction lifecycle states.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
