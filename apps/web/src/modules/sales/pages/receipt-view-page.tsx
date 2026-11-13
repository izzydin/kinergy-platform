import React, { useEffect, useState } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from '@kinergy-platform/ui';
import {
  ArrowLeft,
  Printer,
  Download,
  CheckCircle2,
  RefreshCw,
  Copy,
  AlertCircle,
} from 'lucide-react';
import { useReceiptBySale, useSaleDetail, useReceiptDetail } from '../hooks/use-sales-queries';
import { useIssueReceipt, useReprintReceipt } from '../hooks/use-sales-mutations';
import { salesApi } from '../api/sales-api';
import type { ReceiptDTO } from '../types';
import { MoneyDisplay } from '../components/money-display';
import { PaymentMethodBadge } from '../components/payment-method-badge';
import { HasPermission } from '../../../app/routes/permission-guard';
import { useAuth } from '../../../app/providers/auth-provider';
import { ForbiddenView } from '../../../app/routes/fallback-views';
import { CrudLoading, CrudEmpty, CrudError } from '../../../shared/crud';
import { SALES_ROUTES } from '../routes/sales-routes';

export type ReceiptPrintFormat = 'standard' | '80mm' | '58mm';

function escapeHtml(value: string | number | undefined | null): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMoneySnapshot(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency || 'USD'} ${Number(amount).toFixed(2)}`;
  }
}

export function buildReceiptHtmlDocument(receipt: ReceiptDTO): string {
  const issuedDate = new Date(receipt.issuedAt).toLocaleString();
  const customerName = receipt.clientSnapshot?.fullName || 'Walk-in Customer';
  const customerRef = receipt.clientSnapshot?.referenceNumber
    ? `<div>Member #${escapeHtml(receipt.clientSnapshot.referenceNumber)}</div>`
    : '';
  const customerEmail = receipt.clientSnapshot?.email
    ? `<div>${escapeHtml(receipt.clientSnapshot.email)}</div>`
    : '';
  const customerPhone = receipt.clientSnapshot?.phone
    ? `<div>${escapeHtml(receipt.clientSnapshot.phone)}</div>`
    : '';

  const rowsHtml = receipt.items
    .map(
      (item) => `
        <tr>
          <td>
            <div class="item-name">${escapeHtml(item.description)}</div>
            ${item.skuOrCode ? `<div class="item-sku">${escapeHtml(item.skuOrCode)}</div>` : ''}
          </td>
          <td class="text-center mono">${escapeHtml(item.quantity)}</td>
          <td class="text-right mono">${escapeHtml(
            formatMoneySnapshot(item.unitPrice.amount, item.unitPrice.currency),
          )}</td>
          <td class="text-right mono strong">${escapeHtml(
            formatMoneySnapshot(item.total.amount, item.total.currency),
          )}</td>
        </tr>`,
    )
    .join('');

  const paymentsHtml = receipt.payments
    .map(
      (p) => `
        <div class="payment-row">
          <span>${escapeHtml(p.method)}${p.reference ? ` (Ref: ${escapeHtml(p.reference)})` : ''}</span>
          <span class="mono strong">${escapeHtml(
            formatMoneySnapshot(p.amount.amount, p.amount.currency),
          )}</span>
        </div>`,
    )
    .join('');

  const discountHtml =
    receipt.discountTotal?.amount && receipt.discountTotal.amount > 0
      ? `<div class="summary-row discount">
          <span>Total Discount Applied:</span>
          <span class="mono">-${escapeHtml(
            formatMoneySnapshot(receipt.discountTotal.amount, receipt.discountTotal.currency),
          )}</span>
        </div>`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Receipt ${escapeHtml(receipt.receiptNumber)}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; color: #202522; margin: 24px; }
    .voucher { max-width: 640px; margin: 0 auto; border: 1px solid #d4dcd6; border-radius: 8px; padding: 24px; }
    .header { text-align: center; border-bottom: 1px solid #d4dcd6; padding-bottom: 16px; margin-bottom: 16px; }
    .badge { display: inline-block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; padding: 2px 8px; border: 1px solid #d4dcd6; border-radius: 4px; }
    .receipt-number { font-family: ui-monospace, monospace; font-size: 24px; font-weight: 700; margin: 8px 0; }
    .meta { font-family: ui-monospace, monospace; font-size: 12px; color: #525b55; }
    .section { border-bottom: 1px solid #d4dcd6; padding-bottom: 14px; margin-bottom: 14px; font-size: 13px; }
    .section-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #525b55; margin-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { border-bottom: 1px solid #d4dcd6; padding: 6px 4px; text-align: left; color: #525b55; }
    td { border-bottom: 1px solid #eef2ef; padding: 8px 4px; vertical-align: top; }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .mono { font-family: ui-monospace, monospace; }
    .strong { font-weight: 600; }
    .item-sku { font-family: ui-monospace, monospace; font-size: 10px; color: #525b55; }
    .summary-row { display: flex; justify-content: space-between; margin: 4px 0; font-size: 13px; }
    .summary-total { display: flex; justify-content: space-between; margin-top: 8px; padding-top: 8px; border-top: 1px solid #d4dcd6; font-size: 16px; font-weight: 700; font-family: ui-monospace, monospace; }
    .payment-row { display: flex; justify-content: space-between; padding: 6px 8px; background: #f4faef; border-radius: 4px; margin-top: 4px; font-size: 12px; }
    .footer { text-align: center; font-size: 11px; color: #525b55; padding-top: 12px; }
  </style>
</head>
<body>
  <div class="voucher">
    <div class="header">
      <span class="badge">Official Proof of Purchase</span>
      <div class="receipt-number">${escapeHtml(receipt.receiptNumber)}</div>
      <div class="meta">Order Reference: ${escapeHtml(receipt.saleReference)}</div>
      <div class="meta">Issued: ${escapeHtml(issuedDate)}</div>
    </div>
    <div class="section">
      <div class="section-label">Billed To</div>
      <div class="strong">${escapeHtml(customerName)}</div>
      ${customerRef}
      ${customerEmail}
      ${customerPhone}
    </div>
    <div class="section">
      <div class="section-label">Purchased Items</div>
      <table>
        <thead>
          <tr>
            <th>Item Description</th>
            <th class="text-center">Qty</th>
            <th class="text-right">Unit Price</th>
            <th class="text-right">Total</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    <div class="section">
      <div class="summary-row">
        <span>Subtotal:</span>
        <span class="mono">${escapeHtml(
          formatMoneySnapshot(receipt.subtotal.amount, receipt.subtotal.currency),
        )}</span>
      </div>
      ${discountHtml}
      <div class="summary-total">
        <span>Total Paid (${escapeHtml(receipt.currency)}):</span>
        <span>${escapeHtml(formatMoneySnapshot(receipt.total.amount, receipt.total.currency))}</span>
      </div>
    </div>
    <div class="section">
      <div class="section-label">Tender Settlement Records</div>
      ${paymentsHtml}
    </div>
    <div class="footer">
      <p>Thank you for your business at Kinergy Platform.</p>
      <p>Official proof-of-purchase voucher snapshotted upon settlement.</p>
    </div>
  </div>
</body>
</html>`;
}

export const ReceiptViewPage: React.FC = () => {
  const { saleId } = useParams<{ saleId: string }>();
  const location = useLocation();
  const auth = useAuth();
  const [printFormat, setPrintFormat] = useState<ReceiptPrintFormat>('standard');
  const [issueError, setIssueError] = useState<string | null>(null);
  const [issuedReceipt, setIssuedReceipt] = useState<ReceiptDTO | null>(null);

  useEffect(() => {
    setIssuedReceipt(null);
    setIssueError(null);
  }, [saleId]);

  // Permission verification: receipts.read & receipts.manage
  const canRead = Boolean(
    typeof auth.hasPermission === 'function'
      ? auth.hasPermission('receipts.read')
      : auth.currentUser?.permissions?.includes('receipts.read'),
  );

  const canManageReceipts = Boolean(
    typeof auth.hasPermission === 'function'
      ? auth.hasPermission('receipts.manage')
      : auth.currentUser?.permissions?.includes('receipts.manage'),
  );

  // Handle both sale ID (pos_..., sale_...) and direct receipt identifier (rec_..., REC-...)
  const isDirectReceiptId = Boolean(
    saleId && (saleId.startsWith('rec_') || saleId.startsWith('REC-')),
  );

  const {
    data: receiptBySale,
    isLoading: isLoadingSale,
    isError: isErrorSale,
    error: errorSale,
    refetch: refetchSale,
  } = useReceiptBySale(isDirectReceiptId ? undefined : saleId, {
    enabled: canRead && !isDirectReceiptId,
  });

  const {
    data: receiptById,
    isLoading: isLoadingId,
    isError: isErrorId,
    error: errorId,
    refetch: refetchId,
  } = useReceiptDetail(isDirectReceiptId ? saleId : undefined);

  const receipt =
    issuedReceipt ?? (isDirectReceiptId ? receiptById : (receiptBySale ?? receiptById));
  const isLoading = isDirectReceiptId ? isLoadingId : isLoadingSale;
  const isError = isDirectReceiptId ? isErrorId : isErrorSale;
  const error = isDirectReceiptId ? errorId : errorSale;
  const refetch = isDirectReceiptId ? refetchId : refetchSale;

  const resolvedSaleId = receipt?.saleId || (isDirectReceiptId ? undefined : saleId);
  const { data: relatedSale } = useSaleDetail(resolvedSaleId);

  const backTo =
    (location.state as { from?: string } | null)?.from ||
    (resolvedSaleId ? SALES_ROUTES.detail(resolvedSaleId) : SALES_ROUTES.list());

  const issueReceiptMutation = useIssueReceipt();
  const reprintMutation = useReprintReceipt();

  if (!canRead) {
    return (
      <ForbiddenView message="Access Denied: Missing required permission 'receipts.read' to view receipt vouchers." />
    );
  }

  const handleIssueReceipt = async () => {
    const targetSaleId = receipt?.saleId || (isDirectReceiptId ? undefined : saleId);
    if (!canManageReceipts || !targetSaleId || Boolean(receipt) || issueReceiptMutation.isPending) {
      return;
    }
    setIssueError(null);
    try {
      const result = await issueReceiptMutation.mutateAsync({ saleId: targetSaleId });
      if (result) {
        setIssuedReceipt(result);
      }
      refetch();
    } catch (err: unknown) {
      const errorObj = err as Record<string, unknown>;
      const rawMsg =
        ((errorObj?.response as Record<string, unknown>)?.data as Record<string, unknown>)
          ?.message ??
        (errorObj?.message as string) ??
        'Failed to issue receipt voucher.';
      const msg = Array.isArray(rawMsg) ? rawMsg.join(', ') : String(rawMsg);

      if (
        msg.toLowerCase().includes('already exists') ||
        msg.toLowerCase().includes('duplicate receipt')
      ) {
        try {
          const existing = await salesApi.getReceiptBySale(targetSaleId);
          if (existing) {
            setIssuedReceipt(existing);
            refetch();
            return;
          }
        } catch {
          // fall through to show error if retrieval also fails
        }
      }

      setIssueError(msg);
    }
  };

  const handleReprint = async () => {
    if (!canManageReceipts || !receipt?.id || reprintMutation.isPending) return;
    try {
      const updated = await reprintMutation.mutateAsync({ receiptId: receipt.id });
      if (updated) {
        setIssuedReceipt(updated);
      }
    } catch {
      // error toast handled by mutation hook
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    if (!receipt) return;
    const htmlContent = buildReceiptHtmlDocument(receipt);
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${receipt.receiptNumber}.html`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
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

          {/* Download Receipt Document */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            className="gap-1.5 h-8 text-xs"
            data-testid="receipt-download-button"
          >
            <Download className="h-3.5 w-3.5" /> Download Receipt
          </Button>

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
