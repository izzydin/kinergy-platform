import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNotification } from '../../../app/providers/notification-provider';
import { salesApi, salesQueryKeys } from '../api';
import type {
  AddSaleItemInputDTO,
  ApplyDiscountInputDTO,
  AssignSaleSourceInputDTO,
  CancelPaymentInputDTO,
  CancelSaleInputDTO,
  CoordinateSalePaymentInputDTO,
  CreateSaleInputDTO,
  IssueReceiptInputDTO,
  RecordPaymentInputDTO,
  SettlePaymentInputDTO,
} from '../types';

/**
 * Hook to create a new commercial checkout session in DRAFT status
 */
export function useCreateSale() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation({
    mutationFn: ({
      input,
      idempotencyKey,
    }: {
      input: CreateSaleInputDTO;
      idempotencyKey?: string;
    }) => salesApi.createSale(input, idempotencyKey),
    onSuccess: (newSale) => {
      notification.success(`Sale order "${newSale.id}" initialized in DRAFT status`);
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.lists() });
    },
    onError: (error: Error) => {
      notification.error(error.message || 'Failed to initialize sale');
    },
  });
}

/**
 * Hook to assign or update commercial origin source reference
 */
export function useAssignSaleSource() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation({
    mutationFn: ({ saleId, input }: { saleId: string; input: AssignSaleSourceInputDTO }) =>
      salesApi.assignSaleSource(saleId, input),
    onSuccess: (updatedSale) => {
      notification.success('Sale origin reference assigned successfully');
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.detail(updatedSale.id) });
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.lists() });
    },
    onError: (error: Error) => {
      notification.error(error.message || 'Failed to assign sale source reference');
    },
  });
}

/**
 * Hook to add a line item to an active DRAFT sale order
 */
export function useAddSaleItem() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation({
    mutationFn: ({ saleId, item }: { saleId: string; item: AddSaleItemInputDTO }) =>
      salesApi.addSaleItem(saleId, item),
    onSuccess: (updatedSale) => {
      notification.success('Line item added successfully');
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.detail(updatedSale.id) });
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.calculate(updatedSale.id) });
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.lists() });
    },
    onError: (error: Error) => {
      notification.error(error.message || 'Failed to add line item');
    },
  });
}

/**
 * Hook to remove a line item from a DRAFT sale order
 */
export function useRemoveSaleItem() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation({
    mutationFn: ({ saleId, itemId }: { saleId: string; itemId: string }) =>
      salesApi.removeSaleItem(saleId, itemId),
    onSuccess: (updatedSale) => {
      notification.success('Line item removed successfully');
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.detail(updatedSale.id) });
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.calculate(updatedSale.id) });
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.lists() });
    },
    onError: (error: Error) => {
      notification.error(error.message || 'Failed to remove line item');
    },
  });
}

/**
 * Hook to apply order-level percentage or fixed discount
 */
export function useApplyOrderDiscount() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation({
    mutationFn: ({ saleId, discount }: { saleId: string; discount: ApplyDiscountInputDTO }) =>
      salesApi.applyOrderDiscount(saleId, discount),
    onSuccess: (updatedSale) => {
      notification.success('Order discount applied successfully');
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.detail(updatedSale.id) });
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.calculate(updatedSale.id) });
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.lists() });
    },
    onError: (error: Error) => {
      notification.error(error.message || 'Failed to apply order discount');
    },
  });
}

/**
 * Hook to remove order-level discount
 */
export function useRemoveOrderDiscount() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation({
    mutationFn: (saleId: string) => salesApi.removeOrderDiscount(saleId),
    onSuccess: (updatedSale) => {
      notification.success('Order discount removed successfully');
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.detail(updatedSale.id) });
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.calculate(updatedSale.id) });
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.lists() });
    },
    onError: (error: Error) => {
      notification.error(error.message || 'Failed to remove order discount');
    },
  });
}

/**
 * Hook to finalize a DRAFT sale, locking items and transitioning to PENDING_PAYMENT
 */
export function useFinalizeSale() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation({
    mutationFn: (saleId: string) => salesApi.finalizeSale(saleId),
    onSuccess: (updatedSale) => {
      notification.success('Sale finalized and submitted for payment');
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.detail(updatedSale.id) });
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.lists() });
    },
    onError: (error: Error) => {
      notification.error(error.message || 'Failed to finalize sale');
    },
  });
}

/**
 * Hook to cancel a sale order with reason
 */
export function useCancelSale() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation({
    mutationFn: ({ saleId, input }: { saleId: string; input: CancelSaleInputDTO }) =>
      salesApi.cancelSale(saleId, input),
    onSuccess: (updatedSale) => {
      notification.success('Sale order cancelled');
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.detail(updatedSale.id) });
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.receiptBySale(updatedSale.id) });
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.lists() });
    },
    onError: (error: Error) => {
      notification.error(error.message || 'Failed to cancel sale order');
    },
  });
}

/**
 * Hook to coordinate verified payment settlement against a sale
 */
export function useCoordinateSalePayment() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation({
    mutationFn: ({ saleId, input }: { saleId: string; input: CoordinateSalePaymentInputDTO }) =>
      salesApi.coordinateSalePayment(saleId, input),
    onSuccess: (updatedSale) => {
      notification.success('Payment settlement coordinated successfully');
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.detail(updatedSale.id) });
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.paymentsBySale(updatedSale.id) });
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.receiptBySale(updatedSale.id) });
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.lists() });
    },
    onError: (error: Error) => {
      notification.error(error.message || 'Failed to coordinate payment settlement');
    },
  });
}

/**
 * Hook to record payment tender against a sale order
 */
export function useRecordPayment() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation({
    mutationFn: ({ saleId, input }: { saleId: string; input: RecordPaymentInputDTO }) =>
      salesApi.recordPayment(saleId, input),
    onSuccess: (_payment, variables) => {
      notification.success('Payment tender recorded successfully');
      queryClient.invalidateQueries({
        queryKey: salesQueryKeys.paymentsBySale(variables.saleId),
      });
      queryClient.invalidateQueries({
        queryKey: salesQueryKeys.detail(variables.saleId),
      });
      queryClient.invalidateQueries({
        queryKey: salesQueryKeys.receiptBySale(variables.saleId),
      });
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.payments.lists() });
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.lists() });
    },
    onError: (error: Error) => {
      notification.error(error.message || 'Failed to record payment tender');
    },
  });
}

/**
 * Hook to settle/complete a pending payment
 */
export function useSettlePayment() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation({
    mutationFn: ({ paymentId, input }: { paymentId: string; input?: SettlePaymentInputDTO }) =>
      salesApi.settlePayment(paymentId, input),
    onSuccess: (payment) => {
      notification.success('Payment confirmed settled');
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.payments.detail(payment.id) });
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.payments.lists() });
      queryClient.invalidateQueries({
        queryKey: salesQueryKeys.paymentsBySale(payment.saleId),
      });
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.detail(payment.saleId) });
      queryClient.invalidateQueries({
        queryKey: salesQueryKeys.receiptBySale(payment.saleId),
      });
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.receipts() });
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.lists() });
    },
    onError: (error: Error) => {
      notification.error(error.message || 'Failed to settle payment');
    },
  });
}

/**
 * Hook to fail a pending payment tender
 */
export function useFailPayment() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: string; reason?: string }) =>
      salesApi.failPayment(paymentId, reason),
    onSuccess: (payment) => {
      notification.error('Payment marked as failed');
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.payments.detail(payment.id) });
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.payments.lists() });
      queryClient.invalidateQueries({
        queryKey: salesQueryKeys.paymentsBySale(payment.saleId),
      });
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.detail(payment.saleId) });
      queryClient.invalidateQueries({
        queryKey: salesQueryKeys.receiptBySale(payment.saleId),
      });
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.lists() });
    },
    onError: (error: Error) => {
      notification.error(error.message || 'Failed to update payment status');
    },
  });
}

/**
 * Hook to cancel/void a pending payment tender
 */
export function useCancelPayment() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation({
    mutationFn: ({ paymentId, input }: { paymentId: string; input?: CancelPaymentInputDTO }) =>
      salesApi.cancelPayment(paymentId, input),
    onSuccess: (payment) => {
      notification.success('Payment tender cancelled');
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.payments.detail(payment.id) });
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.payments.lists() });
      queryClient.invalidateQueries({
        queryKey: salesQueryKeys.paymentsBySale(payment.saleId),
      });
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.detail(payment.saleId) });
      queryClient.invalidateQueries({
        queryKey: salesQueryKeys.receiptBySale(payment.saleId),
      });
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.lists() });
    },
    onError: (error: Error) => {
      notification.error(error.message || 'Failed to cancel payment');
    },
  });
}

/**
 * Hook to issue official receipt voucher for settled sale
 */
export function useIssueReceipt() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation({
    mutationFn: ({ saleId, input }: { saleId: string; input?: IssueReceiptInputDTO }) =>
      salesApi.issueReceipt(saleId, input),
    onSuccess: (receipt) => {
      notification.success(`Receipt "${receipt.receiptNumber}" issued successfully`);
      queryClient.invalidateQueries({
        queryKey: salesQueryKeys.receiptBySale(receipt.saleId),
      });
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.receiptById(receipt.id) });
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.receipts() });
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.detail(receipt.saleId) });
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.lists() });
    },
    onError: (error: Error) => {
      notification.error(error.message || 'Failed to issue receipt voucher');
    },
  });
}

/**
 * Hook to record official duplicate reprint of customer receipt voucher
 */
export function useReprintReceipt() {
  const queryClient = useQueryClient();
  const notification = useNotification();

  return useMutation({
    mutationFn: ({ receiptId }: { receiptId: string }) => salesApi.reprintReceipt(receiptId),
    onSuccess: (receipt) => {
      notification.success(
        `Duplicate receipt voucher reprint #${receipt.reprintCount ?? 1} recorded`,
      );
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.receiptById(receipt.id) });
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.receiptBySale(receipt.saleId) });
      queryClient.invalidateQueries({ queryKey: salesQueryKeys.receipts() });
    },
    onError: (error: Error) => {
      notification.error(error.message || 'Failed to record receipt reprint');
    },
  });
}
