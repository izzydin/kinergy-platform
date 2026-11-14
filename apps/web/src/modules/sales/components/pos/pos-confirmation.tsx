import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from '@kinergy-platform/ui';
import { CheckCircle2, Receipt, PlusCircle, ExternalLink } from 'lucide-react';
import type { PosCompletedSaleSummary } from './pos-types';
import { SALES_ROUTES } from '../../routes/sales-routes';
import { formatMoneyCents, toCents } from '../../utils/financial-math';
import { useTranslation } from '../../../../app/providers/locale-provider';

export interface PosConfirmationProps {
  summary: PosCompletedSaleSummary;
  onStartNewSale: () => void;
}

export const PosConfirmation: React.FC<PosConfirmationProps> = ({ summary, onStartNewSale }) => {
  const { locale, t } = useTranslation();

  return (
    <div className="max-w-2xl mx-auto space-y-6" data-testid="pos-confirmation-view">
      <Card className="border-emerald-500/30 bg-emerald-500/5 shadow-md">
        <CardHeader className="text-center pb-2 pt-6">
          <div className="h-12 w-12 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center mb-2">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <CardTitle className="text-xl font-bold text-foreground">
            {locale === 'es'
              ? t('sales.pos.confirmation.title', 'Venta completada exitosamente')
              : 'Sale Completed Successfully'}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {locale === 'es'
              ? t(
                  'sales.pos.confirmation.subtitle',
                  'Transacción liquidada y comprobante comercial registrado.',
                )
              : 'Transaction settled and commercial proof-of-purchase recorded.'}
          </p>
        </CardHeader>

        <CardContent className="p-6 space-y-5">
          {/* Transaction Metadata Grid */}
          <div className="p-4 rounded-lg border border-border bg-card grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-muted-foreground block text-[11px]">
                {locale === 'es' ? t('sales.pos.confirmation.saleId', 'ID de venta') : 'Sale ID'}
              </span>
              <span
                className="font-mono font-bold text-foreground truncate block"
                title={summary.saleId}
              >
                {summary.saleId}
              </span>
            </div>

            <div>
              <span className="text-muted-foreground block text-[11px]">
                {locale === 'es' ? t('sales.pos.confirmation.status', 'Estado') : 'Status'}
              </span>
              <Badge
                variant="outline"
                className="text-[10px] border-emerald-500 text-emerald-600 dark:text-emerald-400"
              >
                {summary.paymentStatus || 'PAID'}
              </Badge>
            </div>

            <div>
              <span className="text-muted-foreground block text-[11px]">
                {locale === 'es'
                  ? t('sales.pos.confirmation.tenderMethod', 'Método de pago')
                  : 'Tender Method'}
              </span>
              <Badge variant="secondary" className="text-[10px]">
                {summary.paymentMethod}
              </Badge>
            </div>

            <div>
              <span className="text-muted-foreground block text-[11px]">
                {locale === 'es' ? t('sales.pos.confirmation.customer', 'Cliente') : 'Customer'}
              </span>
              <span className="font-semibold text-foreground truncate block">
                {summary.isWalkIn
                  ? locale === 'es'
                    ? t('sales.pos.confirmation.walkInGuest', 'Cliente de paso')
                    : 'Walk-in Guest'
                  : summary.clientName || summary.clientId || 'Client'}
              </span>
            </div>
          </div>

          {/* Itemized Table */}
          <div className="border border-border rounded-lg overflow-hidden text-xs">
            <div className="bg-muted/40 px-3 py-2 font-semibold text-foreground border-b border-border flex justify-between">
              <span>
                {locale === 'es'
                  ? t('sales.pos.confirmation.itemizedSummary', 'Resumen detallado del recibo')
                  : 'Itemized Receipt Summary'}
              </span>
              <span>
                {locale === 'es' ? t('sales.pos.confirmation.amount', 'Monto') : 'Amount'}
              </span>
            </div>
            <div className="divide-y divide-border/60 bg-card">
              {summary.items.map((item) => (
                <div key={item.id} className="px-3 py-2 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="font-medium text-foreground">{item.name}</span>
                    <span className="text-[11px] text-muted-foreground block font-mono">
                      {item.quantity} × {formatMoneyCents(item.unitPriceCents, summary.currency)}
                    </span>
                  </div>
                  <span className="font-mono font-semibold text-foreground">
                    {formatMoneyCents(item.unitPriceCents * item.quantity, summary.currency)}
                  </span>
                </div>
              ))}
            </div>

            {/* Financial Breakdown */}
            <div className="bg-muted/20 px-3 py-2.5 border-t border-border space-y-1">
              <div className="flex justify-between text-muted-foreground text-[11px]">
                <span>
                  {locale === 'es'
                    ? t('sales.pos.confirmation.subtotal', 'Subtotal:')
                    : 'Subtotal:'}
                </span>
                <span className="font-mono">
                  {formatMoneyCents(toCents(summary.subtotalAmount), summary.currency)}
                </span>
              </div>
              {summary.discountAmount > 0 && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400 text-[11px]">
                  <span>
                    {locale === 'es'
                      ? t('sales.pos.confirmation.discount', 'Descuento:')
                      : 'Discount:'}
                  </span>
                  <span className="font-mono">
                    - {formatMoneyCents(toCents(summary.discountAmount), summary.currency)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-foreground pt-1 border-t border-border">
                <span>
                  {locale === 'es'
                    ? t('sales.pos.confirmation.totalSettled', 'Total cobrado:')
                    : 'Total Settled:'}
                </span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400">
                  {formatMoneyCents(toCents(summary.totalAmount), summary.currency)}
                </span>
              </div>

              {summary.tenderAmount !== undefined && summary.changeAmount !== undefined && (
                <div className="flex justify-between text-[11px] text-muted-foreground pt-1 border-t border-dashed border-border">
                  <span>
                    {locale === 'es'
                      ? t('sales.pos.confirmation.cashTendered', 'Efectivo recibido:')
                      : 'Cash Tendered:'}{' '}
                    ${summary.tenderAmount.toFixed(2)}
                  </span>
                  <span>
                    {locale === 'es'
                      ? t('sales.pos.confirmation.changeGiven', 'Cambio entregado:')
                      : 'Change Given:'}{' '}
                    ${summary.changeAmount.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Action Triggers */}
          <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
            <Button
              type="button"
              variant="default"
              onClick={onStartNewSale}
              className="w-full sm:flex-1 h-9 text-xs gap-1.5"
              data-testid="pos-new-sale-btn"
            >
              <PlusCircle className="h-4 w-4" />{' '}
              {locale === 'es'
                ? t('sales.pos.confirmation.startNextSale', 'Iniciar nueva venta')
                : 'Start Next Sale'}
            </Button>

            {summary.saleId && (
              <Button
                asChild
                variant="outline"
                className="w-full sm:w-auto h-9 text-xs gap-1.5"
                data-testid="pos-view-receipt-btn"
              >
                <Link to={SALES_ROUTES.receipt(summary.saleId)} state={{ from: '/sales/new' }}>
                  <Receipt className="h-4 w-4" />{' '}
                  {locale === 'es'
                    ? t('sales.pos.confirmation.viewReceipt', 'Ver recibo')
                    : 'View Receipt'}
                </Link>
              </Button>
            )}

            <Button
              asChild
              variant="outline"
              className="w-full sm:w-auto h-9 text-xs gap-1.5"
              data-testid="pos-view-sale-detail-btn"
            >
              <Link to={SALES_ROUTES.detail(summary.saleId)}>
                <ExternalLink className="h-4 w-4" />{' '}
                {locale === 'es'
                  ? t('sales.pos.confirmation.saleAgreement', 'Contrato de venta')
                  : 'Sale Agreement'}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
