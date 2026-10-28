import React, { useState } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from '@kinergy-platform/ui';
import { ArrowLeft, Printer, CheckCircle2, RefreshCw, Copy, AlertCircle } from 'lucide-react';
import { useReceiptBySale, useSaleDetail } from '../hooks/use-sales-queries';
import { useIssueReceipt, useReprintReceipt } from '../hooks/use-sales-mutations';
import { MoneyDisplay } from '../components/money-display';
import { PaymentMethodBadge } from '../components/payment-method-badge';
import { HasPermission } from '../../../app/routes/permission-guard';
import { useAuth } from '../../../app/providers/auth-provider';
import { ForbiddenView } from '../../../app/routes/fallback-views';
import { CrudLoading, CrudEmpty, CrudError } from '../../../shared/crud';
import { SALES_ROUTES } from '../routes/sales-routes';

export type ReceiptPrintFormat = 'standard' | '80mm' | '58mm';

export const ReceiptViewPage: React.FC = () => {
  const { saleId } = useParams<{ saleId: string }>();
  const location = useLocation();
  const auth = useAuth();
  const [printFormat, setPrintFormat] = useState<ReceiptPrintFormat>('standard');
  const [issueError, setIssueError] = useState<string | null>(null);

  const backTo =
    (location.state as { from?: string } | null)?.from ||
    (saleId ? SALES_ROUTES.detail(saleId) : SALES_ROUTES.list());

  // Permission verification: receipts.read
  const canRead = Boolean(
    typeof auth.hasPermission === 'function'
      ? auth.hasPermission('receipts.read')
      : auth.currentUser?.permissions?.includes('receipts.read'),
  );

  const { data: receipt, isLoading, isError, error, refetch } = useReceiptBySale(saleId);
  const { data: relatedSale } = useSaleDetail(saleId);
  const issueReceiptMutation = useIssueReceipt();
  const reprintMutation = useReprintReceipt();

  if (!canRead) {
    return (
      <ForbiddenView message="Access Denied: Missing required permission 'receipts.read' to view receipt vouchers." />
    );
  }

  const handleIssueReceipt = async () => {
    if (!saleId || issueReceiptMutation.isPending) return;
    setIssueError(null);
    try {
      await issueReceiptMutation.mutateAsync({ saleId });
      refetch();
    } catch (err: unknown) {
      const errorObj = err as Record<string, unknown>;
      const rawMsg =
        ((errorObj?.response as Record<string, unknown>)?.data as Record<string, unknown>)
          ?.message ??
        (errorObj?.message as string) ??
        'Failed to issue receipt voucher.';
      const msg = Array.isArray(rawMsg) ? rawMsg.join(', ') : String(rawMsg);
      setIssueError(msg);
    }
  };

  const handleReprint = async () => {
    if (!receipt?.id || reprintMutation.isPending) return;
    try {
      await reprintMutation.mutateAsync({ receiptId: receipt.id });
    } catch {
      // error toast handled by mutation hook
    }
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
                <Link to={backTo}>Return to Sale</Link>
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  // Not yet issued / unavailable / ineligible
  if (isNotFound || !receipt) {
    const isCancelled = relatedSale?.status === 'CANCELLED';
    const isUnsettled =
      relatedSale &&
      relatedSale.status !== 'PAID' &&
      relatedSale.status !== 'COMPLETED' &&
      !isCancelled;

    if (isCancelled) {
      return (
        <div className="p-8 max-w-lg mx-auto space-y-4" data-testid="receipt-ineligible-cancelled">
          <CrudEmpty
            title="Receipt Ineligible (Sale Cancelled)"
            description={`Commercial sale agreement "${saleId || 'unknown'}" is cancelled. In accordance with legal and financial audit invariants, proof-of-purchase receipts cannot be generated for cancelled agreements.`}
            action={
              <div className="flex items-center justify-center gap-3 pt-2">
                {saleId && (
                  <Button asChild variant="outline" size="sm">
                    <Link to={backTo}>
                      <ArrowLeft className="h-4 w-4 mr-1.5" /> Return to Sale
                    </Link>
                  </Button>
                )}
              </div>
            }
          />
        </div>
      );
    }

    if (isUnsettled) {
      return (
        <div className="p-8 max-w-lg mx-auto space-y-4" data-testid="receipt-not-issued">
          <div data-testid="receipt-ineligible-unsettled">
            <CrudEmpty
              title="Receipt Not Issued Yet"
              description={`Commercial sale agreement "${saleId || 'unknown'}" has status "${relatedSale.status}". Official receipts are generated only after a sale order is fully settled (zero remaining balance).`}
              action={
                <div className="flex items-center justify-center gap-3 pt-2">
                  {saleId && (
                    <Button asChild variant="outline" size="sm">
                      <Link to={backTo}>
                        <ArrowLeft className="h-4 w-4 mr-1.5" /> Return to Sale
                      </Link>
                    </Button>
                  )}
                </div>
              }
            />
          </div>
        </div>
      );
    }

    return (
      <div className="p-8 max-w-lg mx-auto space-y-4" data-testid="receipt-not-issued">
        {issueError && (
          <div
            className="p-3 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-xs flex items-start gap-2"
            role="alert"
            data-testid="issue-receipt-error"
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Receipt Issuance Rejected</p>
              <p>{issueError}</p>
            </div>
          </div>
        )}
        <CrudEmpty
          title="Receipt Not Issued Yet"
          description={`No official receipt voucher has been issued for sale "${saleId || 'unknown'}". In accordance with financial audit rules, official receipts are generated only after a sale order is fully settled.`}
          action={
            <div className="flex items-center justify-center gap-3 pt-2">
              {saleId && (
                <Button asChild variant="outline" size="sm">
                  <Link to={backTo}>
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
      {/* Dynamic print-media style injection according to chosen format */}
      <style>{`
        @media print {
          @page {
            margin: ${printFormat === 'standard' ? '10mm' : '0mm'};
            size: ${printFormat === '80mm' ? '80mm auto' : printFormat === '58mm' ? '58mm auto' : 'auto'};
          }
          body {
            background: white !important;
            color: black !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Action Navigation Bar (Hidden during print) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between no-print print:hidden">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to={backTo}>
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

        <div className="flex flex-wrap items-center gap-2">
          {/* Format Selector */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <label htmlFor="receipt-format-select" className="font-medium whitespace-nowrap">
              Format:
            </label>
            <select
              id="receipt-format-select"
              value={printFormat}
              onChange={(e) => setPrintFormat(e.target.value as ReceiptPrintFormat)}
              className="h-8 rounded-md border border-input bg-background px-2 py-1 text-xs"
              data-testid="receipt-format-selector"
            >
              <option value="standard">Standard (Document)</option>
              <option value="80mm">80mm POS Thermal</option>
              <option value="58mm">58mm Compact Thermal</option>
            </select>
          </div>

          {/* Record Official Reprint (Audited Duplicate) */}
          <HasPermission name="receipts.manage">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReprint}
              disabled={reprintMutation.isPending}
              className="gap-1.5 h-8 text-xs"
              data-testid="receipt-reprint-button"
            >
              {reprintMutation.isPending ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Recording Reprint...
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" /> Record Official Reprint
                </>
              )}
            </Button>
          </HasPermission>

          {/* Browser Print Trigger */}
          <Button
            variant="default"
            size="sm"
            onClick={handlePrint}
            className="gap-1.5 h-8 text-xs"
            data-testid="receipt-print-button"
          >
            <Printer className="h-3.5 w-3.5" /> Print Receipt
          </Button>
        </div>
      </div>

      {/* Printable Receipt Paper Container */}
      <div
        className={`transition-all duration-200 mx-auto ${
          printFormat === '80mm'
            ? 'w-[80mm] max-w-[80mm] font-mono text-[11px]'
            : printFormat === '58mm'
              ? 'w-[58mm] max-w-[58mm] font-mono text-[9px]'
              : 'max-w-2xl w-full'
        } print:max-w-none print:w-auto print:m-0 print:p-0`}
        data-testid="receipt-paper-container"
        data-format={printFormat}
      >
        <Card className="border border-border shadow-sm print:border-none print:shadow-none bg-card overflow-hidden">
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
            {receipt.reprintCount && receipt.reprintCount > 0 ? (
              <div
                className="border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 font-mono text-xs px-3 py-1.5 rounded uppercase font-bold text-center tracking-wider"
                data-testid="receipt-duplicate-watermark"
              >
                COPY / DUPLICATE VOUCHER — REPRINT #{receipt.reprintCount}
                {receipt.lastReprintedAt
                  ? ` (Last: ${new Date(receipt.lastReprintedAt).toLocaleString()})`
                  : ''}
              </div>
            ) : null}
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

              {Boolean(receipt.discountTotal?.amount && receipt.discountTotal.amount > 0) && (
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
                Official proof-of-purchase voucher snapshotted upon settlement. Viewing,
                downloading, or printing this document is strictly read-only and does not create,
                settle, or alter server payment records or transaction lifecycle states.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
