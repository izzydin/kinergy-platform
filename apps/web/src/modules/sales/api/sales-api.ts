import { httpClient } from '../../../shared/api/http-client';
import type {
  AddSaleItemInputDTO,
  ApplyDiscountInputDTO,
  CancelPaymentInputDTO,
  CancelSaleInputDTO,
  CreateSaleInputDTO,
  IssueReceiptInputDTO,
  ListPaymentsQueryParams,
  ListSalesQueryParams,
  PaginatedPaymentsDTO,
  PaginatedSalesDTO,
  PaymentDetailDTO,
  PaymentDTO,
  PaymentSummaryDTO,
  ReceiptDTO,
  RecordPaymentInputDTO,
  SaleDTO,
  SaleTotalsDTO,
  SettlePaymentInputDTO,
} from '../types';

/**
 * Standardized Sales, Payments & Receipts API Client Adapter
 *
 * Encapsulates all transport calls to backend controllers:
 * - SalesController: /api/v1/sales
 * - PaymentsController: /api/v1/payments & /api/v1/sales/:id/payments
 * - ReceiptsController: /api/v1/sales/:id/receipt & /api/v1/receipts/:id
 */
export const salesApi = {
  // ============================================================================
  // Sales Operations
  // ============================================================================

  /**
   * Lists commercial sales orders with multi-criteria URL state filtering & pagination
   */
  async listSales(params?: ListSalesQueryParams): Promise<PaginatedSalesDTO> {
    return httpClient.get<PaginatedSalesDTO>('/api/v1/sales', {
      params: {
        page: params?.page,
        limit: params?.limit,
        sort: params?.sort,
        sortField: params?.sortField,
        sortDirection: params?.sortDirection,
        clientId: params?.clientId,
        status: params?.status,
        sourceType: params?.sourceType,
        sourceReferenceId: params?.sourceReferenceId,
        fromDate: params?.fromDate,
        toDate: params?.toDate,
        q: params?.q,
        search: params?.search,
      },
    });
  },

  /**
   * Retrieves single commercial sale by UUID identifier
   */
  async getSaleById(id: string): Promise<SaleDTO> {
    return httpClient.get<SaleDTO>(`/api/v1/sales/${encodeURIComponent(id)}`);
  },

  /**
   * Calculates subtotal, discount, and total without state mutation
   */
  async calculateSaleTotals(id: string): Promise<SaleTotalsDTO> {
    return httpClient.get<SaleTotalsDTO>(`/api/v1/sales/${encodeURIComponent(id)}/calculate`);
  },

  /**
   * Initializes a commercial checkout agreement in DRAFT status
   */
  async createSale(input: CreateSaleInputDTO, idempotencyKey?: string): Promise<SaleDTO> {
    return httpClient.post<SaleDTO>('/api/v1/sales', input, {
      headers: idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : undefined,
    });
  },

  /**
   * Appends line item to an active DRAFT sale order
   */
  async addSaleItem(saleId: string, item: AddSaleItemInputDTO): Promise<SaleDTO> {
    return httpClient.post<SaleDTO>(`/api/v1/sales/${encodeURIComponent(saleId)}/items`, item);
  },

  /**
   * Removes line item from an active DRAFT sale order
   */
  async removeSaleItem(saleId: string, itemId: string): Promise<SaleDTO> {
    return httpClient.delete<SaleDTO>(
      `/api/v1/sales/${encodeURIComponent(saleId)}/items/${encodeURIComponent(itemId)}`,
    );
  },

  /**
   * Applies an order-level percentage or fixed discount to a DRAFT sale order
   */
  async applyOrderDiscount(saleId: string, discount: ApplyDiscountInputDTO): Promise<SaleDTO> {
    return httpClient.post<SaleDTO>(
      `/api/v1/sales/${encodeURIComponent(saleId)}/discount`,
      discount,
    );
  },

  /**
   * Clears order-level discount from a DRAFT sale order
   */
  async removeOrderDiscount(saleId: string): Promise<SaleDTO> {
    return httpClient.delete<SaleDTO>(`/api/v1/sales/${encodeURIComponent(saleId)}/discount`);
  },

  /**
   * Finalizes a DRAFT sale agreement, transitioning state to PENDING_PAYMENT
   */
  async finalizeSale(saleId: string): Promise<SaleDTO> {
    return httpClient.post<SaleDTO>(`/api/v1/sales/${encodeURIComponent(saleId)}/finalize`, {});
  },

  /**
   * Cancels an open or pending sale order with mandatory reason
   */
  async cancelSale(saleId: string, input: CancelSaleInputDTO): Promise<SaleDTO> {
    return httpClient.post<SaleDTO>(`/api/v1/sales/${encodeURIComponent(saleId)}/cancel`, input);
  },

  // ============================================================================
  // Payments Operations
  // ============================================================================

  /**
   * Lists payment transactions across all orders with multi-criteria filtering
   */
  async listPayments(params?: ListPaymentsQueryParams): Promise<PaginatedPaymentsDTO> {
    return httpClient.get<PaginatedPaymentsDTO>('/api/v1/payments', {
      params: {
        page: params?.page,
        limit: params?.limit,
        sort: params?.sort,
        saleId: params?.saleId,
        status: params?.status,
        method: params?.method,
        fromDate: params?.fromDate,
        toDate: params?.toDate,
      },
    });
  },

  /**
   * Retrieves single payment transaction details
   */
  async getPaymentById(id: string): Promise<PaymentDetailDTO> {
    return httpClient.get<PaymentDetailDTO>(`/api/v1/payments/${encodeURIComponent(id)}`);
  },

  /**
   * Retrieves payment tenders recorded against a specific sale order
   */
  async getSalePaymentHistory(saleId: string): Promise<PaymentSummaryDTO[]> {
    return httpClient.get<PaymentSummaryDTO[]>(
      `/api/v1/sales/${encodeURIComponent(saleId)}/payments`,
    );
  },

  /**
   * Records a payment tender against a finalized sale order
   */
  async recordPayment(saleId: string, input: RecordPaymentInputDTO): Promise<PaymentDTO> {
    return httpClient.post<PaymentDTO>(
      `/api/v1/sales/${encodeURIComponent(saleId)}/payments`,
      input,
    );
  },

  /**
   * Completes / settles a pending payment tender
   */
  async settlePayment(paymentId: string, input?: SettlePaymentInputDTO): Promise<PaymentDTO> {
    return httpClient.post<PaymentDTO>(
      `/api/v1/payments/${encodeURIComponent(paymentId)}/settle`,
      input ?? {},
    );
  },

  /**
   * Fails a pending payment tender
   */
  async failPayment(paymentId: string, reason?: string): Promise<PaymentDTO> {
    return httpClient.post<PaymentDTO>(`/api/v1/payments/${encodeURIComponent(paymentId)}/fail`, {
      reason,
    });
  },

  /**
   * Cancels / voids a pending payment tender
   */
  async cancelPayment(paymentId: string, input?: CancelPaymentInputDTO): Promise<PaymentDTO> {
    return httpClient.post<PaymentDTO>(
      `/api/v1/payments/${encodeURIComponent(paymentId)}/cancel`,
      input ?? {},
    );
  },

  // ============================================================================
  // Receipts Operations
  // ============================================================================

  /**
   * Retrieves canonical point-in-time receipt voucher for a settled sale order
   */
  async getReceiptBySale(saleId: string): Promise<ReceiptDTO> {
    return httpClient.get<ReceiptDTO>(`/api/v1/sales/${encodeURIComponent(saleId)}/receipt`);
  },

  /**
   * Retrieves receipt voucher by its own UUID identifier
   */
  async getReceiptById(receiptId: string): Promise<ReceiptDTO> {
    return httpClient.get<ReceiptDTO>(`/api/v1/receipts/${encodeURIComponent(receiptId)}`);
  },

  /**
   * Issues an official proof-of-purchase receipt voucher for an already-settled sale
   */
  async issueReceipt(saleId: string, input?: IssueReceiptInputDTO): Promise<ReceiptDTO> {
    return httpClient.post<ReceiptDTO>(
      `/api/v1/sales/${encodeURIComponent(saleId)}/receipt`,
      input ?? {},
    );
  },
};
