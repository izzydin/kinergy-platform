import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from '@kinergy-platform/ui';
import { ArrowLeft, Printer, Receipt, CheckCircle2 } from 'lucide-react';
import { useReceiptBySale } from '../hooks/use-sales-queries';
import { useIssueReceipt } from '../hooks/use-sales-mutations';
import { MoneyDisplay } from '../components/money-display';
import { PaymentMethodBadge } from '../components/payment-method-badge';
import { HasPermission } from '../../../app/routes/permission-guard';

export const ReceiptViewPage: React.FC = () => {
  const { saleId } = useParams<{ saleId: string }>();

  const { data: receipt, isLoading, isError, refetch } = useReceiptBySale(saleId);
  const issueReceiptMutation = useIssueReceipt();

  const handleIssueReceipt = async () => {
    if (!saleId) return;
    await issueReceiptMutation.mutateAsync({ saleId });
    refetch();
  };

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center text-muted-foreground" data-testid="receipt-view-loading">
        Loading official receipt voucher...
      </div>
    );
  }

  // Not yet issued or error
  if (isError || !receipt) {
    return (
      <div className="p-8 text-center space-y-4 max-w-md mx-auto" data-testid="receipt-not-issued">
        <Receipt className="h-12 w-12 mx-auto text-muted-foreground" />
        <h2 className="text-xl font-bold">Receipt Not Issued Yet</h2>
        <p className="text-sm text-muted-foreground">
          No official receipt document has been issued for sale{' '}
          <span className="font-mono font-medium">{saleId}</span>. The sale must be fully settled
          before a legal voucher is generated.
        </p>

        <div className="flex items-center justify-center gap-3 pt-2">
          <Button asChild variant="outline">
            <Link to={`/sales/${saleId}`}>Return to Sale</Link>
          </Button>

          <HasPermission name="receipts.manage">
            <Button
              onClick={handleIssueReceipt}
              disabled={issueReceiptMutation.isPending}
              className="gap-1.5"
            >
              <CheckCircle2 className="h-4 w-4" />
              {issueReceiptMutation.isPending ? 'Issuing Receipt...' : 'Generate Receipt Now'}
            </Button>
          </HasPermission>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto" data-testid="receipt-view-page">
      {/* Action Navigation Bar */}
      <div className="flex items-center justify-between no-print">
        <Button asChild variant="ghost" size="sm">
          <Link to={`/sales/${saleId}`}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Sale
          </Link>
        </Button>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5">
            <Printer className="h-4 w-4" /> Print Receipt
          </Button>
        </div>
      </div>

      {/* Printable Receipt Paper Card */}
      <Card className="border border-border shadow-sm print:border-none print:shadow-none bg-card">
        <CardHeader className="text-center border-b border-border pb-6 space-y-2">
          <Badge variant="outline" className="mx-auto text-xs uppercase tracking-wider">
            Official Proof of Purchase
          </Badge>
          <CardTitle className="text-2xl font-bold font-mono tracking-tight">
            {receipt.receiptNumber}
          </CardTitle>
          <div className="text-xs text-muted-foreground space-y-0.5 font-mono">
            <div>Order Reference: {receipt.saleReference}</div>
            <div>Issued: {new Date(receipt.issuedAt).toLocaleString()}</div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-6">
          {/* Customer Snapshot */}
          <div className="text-xs space-y-1 pb-4 border-b border-border">
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
              </div>
            ) : (
              <div className="text-muted-foreground">Walk-in Customer</div>
            )}
          </div>

          {/* Line Items Table */}
          <div className="space-y-2">
            <span className="font-semibold text-xs text-muted-foreground uppercase tracking-wider block">
              Purchased Items
            </span>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-1.5 text-left font-medium">Item Description</th>
                  <th className="py-1.5 text-center font-medium">Qty</th>
                  <th className="py-1.5 text-right font-medium">Unit Price</th>
                  <th className="py-1.5 text-right font-medium">Total</th>
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
          <div className="pt-4 border-t border-border space-y-1.5 text-xs">
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
              <span>Total Paid:</span>
              <MoneyDisplay value={receipt.total} />
            </div>
          </div>

          {/* Settled Tender Payments */}
          <div className="pt-4 border-t border-border space-y-2 text-xs">
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
          <div className="pt-6 border-t border-dashed border-border text-center text-[10px] text-muted-foreground">
            <p>Thank you for your business at Kinergy Platform.</p>
            <p>Official tax & transaction voucher snapshotted upon settlement.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
