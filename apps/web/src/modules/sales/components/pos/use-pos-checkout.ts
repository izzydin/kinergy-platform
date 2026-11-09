import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useNotification } from '../../../../app/providers/notification-provider';
import { salesApi, salesQueryKeys } from '../../api';
import { membershipsApi } from '../../../gym/memberships/api/memberships-api';
import type {
  PosCartItem,
  PosDiscount,
  PosPaymentMethod,
  PosCompletedSaleSummary,
} from './pos-types';
import type { ClientModel } from '../../../client/types/client.types';
import { centsToDecimal, toCents } from '../../utils/financial-math';
import { SALES_ROUTES } from '../../routes/sales-routes';

export interface UsePosCheckoutProps {
  currency: string;
  selectedClientId?: string;
  selectedClient?: ClientModel | null;
  isWalkIn: boolean;
  cartItems: PosCartItem[];
  orderDiscount?: PosDiscount;
  onClearCart: () => void;
}

export function usePosCheckout({
  currency,
  selectedClientId,
  selectedClient,
  isWalkIn,
  cartItems,
  orderDiscount,
  onClearCart,
}: UsePosCheckoutProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const notification = useNotification();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [completedSummary, setCompletedSummary] = useState<PosCompletedSaleSummary | null>(null);

  // Generate a deterministic idempotency key for this transaction session
  const [idempotencyKey, setIdempotencyKey] = useState(
    () => `pos_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
  );

  const regenerateIdempotencyKey = () => {
    setIdempotencyKey(`pos_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);
  };

  /**
   * Orchestrates the 4-step commercial POS transaction:
   * 1. Create Sale (DRAFT)
   * 2. Finalize Sale (PENDING_PAYMENT)
   * 3. Record Payment Tender (CASH -> COMPLETED, QR -> PENDING)
   * 4. Issue Official Receipt Voucher (if CASH / Settled)
   */
  const executeCheckout = async (
    paymentMethod: PosPaymentMethod,
    tenderAmount?: number,
    reference?: string,
  ) => {
    if (cartItems.length === 0 || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    // Compute financial totals in integer cents
    const subtotalCents = cartItems.reduce((sum, it) => sum + it.unitPriceCents * it.quantity, 0);
    let discountCents = 0;
    if (orderDiscount && orderDiscount.value > 0) {
      if (orderDiscount.type === 'PERCENTAGE') {
        const pct = Math.min(100, Math.max(0, orderDiscount.value));
        discountCents = Math.round((subtotalCents * pct) / 100);
      } else {
        discountCents = Math.min(subtotalCents, Math.round(orderDiscount.value * 100));
      }
    }
    const netTotalCents = Math.max(0, subtotalCents - discountCents);
    const netTotalAmount = centsToDecimal(netTotalCents);

    try {
      // Step 1: Create Commercial Sale Agreement in DRAFT status
      setStatusMessage('Step 1/4: Initializing sale agreement...');

      // Determine primary upstream source reference if single item or specialized category
      let sourceReference:
        { type: string; referenceId: string; referenceCode?: string } | undefined = undefined;

      if (cartItems.length === 1 && cartItems[0]) {
        const single = cartItems[0];
        if (single.category === 'GYM_MEMBERSHIP') {
          sourceReference = {
            type: 'GYM_MEMBERSHIP',
            referenceId: single.sourceId,
            referenceCode: undefined,
          };
        } else if (single.category === 'KINESIOLOGY') {
          sourceReference = {
            type: 'KINESIOLOGY_SESSION',
            referenceId: single.sourceId,
            referenceCode: single.skuOrCode,
          };
        } else if (single.category === 'ROOM_RENTAL') {
          sourceReference = {
            type: 'ROOM_RENTAL',
            referenceId: single.sourceId,
            referenceCode: single.skuOrCode,
          };
        } else if (single.category === 'FOOD') {
          sourceReference = {
            type: 'FOOD',
            referenceId: single.sourceId,
            referenceCode: single.skuOrCode,
          };
        } else if (single.category === 'DRINKS_PRODUCTS') {
          sourceReference = {
            type: 'DRINK',
            referenceId: single.sourceId,
            referenceCode: single.skuOrCode,
          };
        }
      }

      const saleInput = {
        currency: currency.toUpperCase(),
        clientId: !isWalkIn && selectedClientId ? selectedClientId.trim() : undefined,
        sourceReference,
        items: cartItems.map((item) => ({
          description: item.name,
          skuOrCode: item.skuOrCode || undefined,
          quantity: item.quantity,
          unitPrice: item.unitPriceAmount,
          unitPriceAmount: item.unitPriceAmount,
          sourceType: item.sourceType,
          sourceId: item.sourceId,
        })),
        orderDiscount:
          orderDiscount && orderDiscount.value > 0
            ? {
                type: orderDiscount.type,
                value: orderDiscount.value,
                reason: orderDiscount.reason || 'POS Order Discount',
              }
            : undefined,
      };

      const createdSale = await salesApi.createSale(saleInput, idempotencyKey);

      // Step 2: Finalize Commercial Terms (DRAFT -> PENDING_PAYMENT)
      let finalizedSale = createdSale;
      if (createdSale.status === 'DRAFT') {
        setStatusMessage('Step 2/4: Finalizing commercial agreement...');
        finalizedSale = await salesApi.finalizeSale(createdSale.id);
      }

      // Step 3: Record Payment Tender
      setStatusMessage(
        paymentMethod === 'CASH'
          ? 'Step 3/4: Settling CASH tender...'
          : 'Step 3/4: Recording QR tender...',
      );

      const isCash = paymentMethod === 'CASH';
      const paymentInput = {
        method: paymentMethod,
        amount: netTotalAmount,
        currency: currency.toUpperCase(),
        status: isCash ? ('COMPLETED' as const) : ('PENDING' as const),
        reference:
          reference?.trim() ||
          (isCash
            ? undefined
            : `QR-REF-${Math.random().toString(36).substring(2, 9).toUpperCase()}`),
        idempotencyKey: `pay_${idempotencyKey}`,
      };

      await salesApi.recordPayment(finalizedSale.id, paymentInput);

      // Step 3.5: Activate or fulfill Gym Membership through domain workflow post-settlement
      if (
        cartItems.length === 1 &&
        cartItems[0]?.category === 'GYM_MEMBERSHIP' &&
        selectedClientId &&
        !isWalkIn
      ) {
        try {
          const clientMemberships = await membershipsApi.listMemberships({
            clientId: selectedClientId,
            planId: cartItems[0].sourceId,
            status: 'ACTIVE',
          });
          if (!clientMemberships?.items || clientMemberships.items.length === 0) {
            await membershipsApi.createMembership({
              clientId: selectedClientId,
              planId: cartItems[0].sourceId,
            });
          }
        } catch (mErr) {
          console.warn('Membership activation assurance advisory:', mErr);
        }
      }

      // Step 4: Issue Official Proof-of-Purchase Receipt (for COMPLETED payments)
      let issuedReceipt: { id: string; receiptNumber?: string } | undefined = undefined;
      if (isCash) {
        setStatusMessage('Step 4/4: Generating legal receipt voucher...');
        try {
          issuedReceipt = await salesApi.issueReceipt(finalizedSale.id);
        } catch (receiptErr) {
          // If receipt auto-generation encounters a transient issue, log gracefully
          console.warn('Receipt issuance advisory:', receiptErr);
        }
      }

      // Compute change
      const tenderCentsVal = tenderAmount !== undefined ? toCents(tenderAmount) : netTotalCents;
      const changeAmountVal = isCash
        ? centsToDecimal(Math.max(0, tenderCentsVal - netTotalCents))
        : 0;

      // Invalidate relevant query caches
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.detail(finalizedSale.id) });
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.payments.all });
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.receipts() });
      queryClient.invalidateQueries({ queryKey: ['gym', 'memberships'] });
      queryClient.invalidateQueries({ queryKey: ['gym', 'attendance'] });

      notification.success(`Sale ${finalizedSale.id} completed successfully via ${paymentMethod}!`);

      // Transition to confirmation state
      setCompletedSummary({
        saleId: finalizedSale.id,
        receiptId: issuedReceipt?.id,
        receiptNumber: issuedReceipt?.receiptNumber,
        clientId: selectedClientId,
        clientName: selectedClient?.fullName,
        isWalkIn,
        currency,
        items: [...cartItems],
        subtotalAmount: centsToDecimal(subtotalCents),
        discountAmount: centsToDecimal(discountCents),
        totalAmount: netTotalAmount,
        paymentMethod,
        paymentStatus: isCash ? 'COMPLETED' : 'PENDING',
        completedAt: new Date().toISOString(),
        tenderAmount: isCash && tenderAmount !== undefined ? tenderAmount : netTotalAmount,
        changeAmount: isCash ? changeAmountVal : 0,
      });

      // Clear local cart
      onClearCart();
      regenerateIdempotencyKey();
    } catch (err: unknown) {
      const errObj = err as Record<string, unknown>;
      const msg =
        ((errObj?.response as Record<string, unknown>)?.data as Record<string, unknown>)?.message ??
        (errObj?.message as string) ??
        'An unexpected error occurred during POS checkout.';

      const formattedMsg = Array.isArray(msg) ? msg.join(', ') : String(msg);
      setErrorMessage(formattedMsg);
      notification.error(formattedMsg);
    } finally {
      setIsSubmitting(false);
      setStatusMessage('');
    }
  };

  /**
   * Saves the current transaction as a DRAFT order and navigates to the sale detail page.
   */
  const executeSaveDraft = async () => {
    if (cartItems.length === 0 || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    setStatusMessage('Saving sale agreement as DRAFT...');

    try {
      // Determine primary upstream source reference for draft agreement
      let sourceReference:
        { type: string; referenceId: string; referenceCode?: string } | undefined = undefined;

      if (cartItems.length === 1 && cartItems[0]) {
        const single = cartItems[0];
        if (single.category === 'GYM_MEMBERSHIP') {
          sourceReference = {
            type: 'GYM_MEMBERSHIP',
            referenceId: single.sourceId,
            referenceCode: undefined,
          };
        } else if (single.category === 'KINESIOLOGY') {
          sourceReference = {
            type: 'KINESIOLOGY_SESSION',
            referenceId: single.sourceId,
            referenceCode: single.skuOrCode,
          };
        } else if (single.category === 'ROOM_RENTAL') {
          sourceReference = {
            type: 'ROOM_RENTAL',
            referenceId: single.sourceId,
            referenceCode: single.skuOrCode,
          };
        } else if (single.category === 'FOOD') {
          sourceReference = {
            type: 'FOOD',
            referenceId: single.sourceId,
            referenceCode: single.skuOrCode,
          };
        } else if (single.category === 'DRINKS_PRODUCTS') {
          sourceReference = {
            type: 'DRINK',
            referenceId: single.sourceId,
            referenceCode: single.skuOrCode,
          };
        }
      }

      const saleInput = {
        currency: currency.toUpperCase(),
        clientId: !isWalkIn && selectedClientId ? selectedClientId.trim() : undefined,
        sourceReference,
        items: cartItems.map((item) => ({
          description: item.name,
          skuOrCode: item.skuOrCode || undefined,
          quantity: item.quantity,
          unitPrice: item.unitPriceAmount,
          unitPriceAmount: item.unitPriceAmount,
          sourceType: item.sourceType,
          sourceId: item.sourceId,
        })),
        orderDiscount:
          orderDiscount && orderDiscount.value > 0
            ? {
                type: orderDiscount.type,
                value: orderDiscount.value,
                reason: orderDiscount.reason || 'POS Order Discount',
              }
            : undefined,
      };

      const createdSale = await salesApi.createSale(saleInput, idempotencyKey);
      notification.success(`Draft sale "${createdSale.id}" initialized.`);
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.lists() });
      navigate(SALES_ROUTES.detail(createdSale.id));
    } catch (err: unknown) {
      const errObj = err as Record<string, unknown>;
      const msg =
        ((errObj?.response as Record<string, unknown>)?.data as Record<string, unknown>)?.message ??
        (errObj?.message as string) ??
        'Failed to save draft sale.';
      const formattedMsg = Array.isArray(msg) ? msg.join(', ') : String(msg);
      setErrorMessage(formattedMsg);
      notification.error(formattedMsg);
    } finally {
      setIsSubmitting(false);
      setStatusMessage('');
    }
  };

  const resetPos = () => {
    setCompletedSummary(null);
    setErrorMessage(null);
    setStatusMessage('');
  };

  return {
    isSubmitting,
    statusMessage,
    errorMessage,
    completedSummary,
    executeCheckout,
    executeSaveDraft,
    resetPos,
  };
}
