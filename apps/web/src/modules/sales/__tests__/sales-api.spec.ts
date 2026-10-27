import { salesApi } from '../api/sales-api';
import { httpClient } from '../../../shared/api/http-client';

jest.mock('../../../shared/api/http-client', () => ({
  httpClient: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  },
}));

describe('salesApi Transport Layer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Sales Endpoints', () => {
    it('listSales invokes GET /api/v1/sales with clean query params', async () => {
      (httpClient.get as jest.Mock).mockResolvedValueOnce({ items: [], total: 0 });

      await salesApi.listSales({
        page: 2,
        limit: 50,
        sort: 'total.desc',
        status: 'PAID',
      });

      expect(httpClient.get).toHaveBeenCalledWith('/api/v1/sales', {
        params: expect.objectContaining({
          page: 2,
          limit: 50,
          sort: 'total.desc',
          status: 'PAID',
        }),
      });
    });

    it('getSaleById invokes GET /api/v1/sales/:id with encoded id', async () => {
      (httpClient.get as jest.Mock).mockResolvedValueOnce({ id: 'sale_123' });

      await salesApi.getSaleById('sale_123');

      expect(httpClient.get).toHaveBeenCalledWith('/api/v1/sales/sale_123');
    });

    it('calculateSaleTotals invokes GET /api/v1/sales/:id/calculate', async () => {
      (httpClient.get as jest.Mock).mockResolvedValueOnce({ subtotal: { amount: 10 } });

      await salesApi.calculateSaleTotals('sale_123');

      expect(httpClient.get).toHaveBeenCalledWith('/api/v1/sales/sale_123/calculate');
    });

    it('createSale invokes POST /api/v1/sales with idempotency key header', async () => {
      (httpClient.post as jest.Mock).mockResolvedValueOnce({ id: 'sale_new' });

      const input = {
        currency: 'USD',
        items: [
          {
            sourceType: 'INVENTORY_ITEM',
            sourceId: 'item_1',
            description: 'Shake',
            unitPrice: 5.0,
            quantity: 1,
          },
        ],
      };

      await salesApi.createSale(input, 'idem-key-999');

      expect(httpClient.post).toHaveBeenCalledWith('/api/v1/sales', input, {
        headers: { 'x-idempotency-key': 'idem-key-999' },
      });
    });

    it('addSaleItem invokes POST /api/v1/sales/:id/items', async () => {
      (httpClient.post as jest.Mock).mockResolvedValueOnce({ id: 'sale_1' });

      const item = {
        sourceType: 'INVENTORY_ITEM',
        sourceId: 'item_2',
        description: 'Bar',
        unitPrice: 3.0,
        quantity: 2,
      };

      await salesApi.addSaleItem('sale_1', item);

      expect(httpClient.post).toHaveBeenCalledWith('/api/v1/sales/sale_1/items', item);
    });

    it('removeSaleItem invokes DELETE /api/v1/sales/:id/items/:itemId', async () => {
      (httpClient.delete as jest.Mock).mockResolvedValueOnce({ id: 'sale_1' });

      await salesApi.removeSaleItem('sale_1', 'item_2');

      expect(httpClient.delete).toHaveBeenCalledWith('/api/v1/sales/sale_1/items/item_2');
    });

    it('applyOrderDiscount invokes POST /api/v1/sales/:id/discount', async () => {
      (httpClient.post as jest.Mock).mockResolvedValueOnce({ id: 'sale_1' });

      await salesApi.applyOrderDiscount('sale_1', { type: 'PERCENTAGE', value: 10 });

      expect(httpClient.post).toHaveBeenCalledWith('/api/v1/sales/sale_1/discount', {
        type: 'PERCENTAGE',
        value: 10,
      });
    });

    it('removeOrderDiscount invokes DELETE /api/v1/sales/:id/discount', async () => {
      (httpClient.delete as jest.Mock).mockResolvedValueOnce({ id: 'sale_1' });

      await salesApi.removeOrderDiscount('sale_1');

      expect(httpClient.delete).toHaveBeenCalledWith('/api/v1/sales/sale_1/discount');
    });

    it('finalizeSale invokes POST /api/v1/sales/:id/finalize', async () => {
      (httpClient.post as jest.Mock).mockResolvedValueOnce({
        id: 'sale_1',
        status: 'PENDING_PAYMENT',
      });

      await salesApi.finalizeSale('sale_1');

      expect(httpClient.post).toHaveBeenCalledWith('/api/v1/sales/sale_1/finalize', {});
    });

    it('cancelSale invokes POST /api/v1/sales/:id/cancel with reason', async () => {
      (httpClient.post as jest.Mock).mockResolvedValueOnce({ id: 'sale_1', status: 'CANCELLED' });

      await salesApi.cancelSale('sale_1', { reason: 'Customer aborted' });

      expect(httpClient.post).toHaveBeenCalledWith('/api/v1/sales/sale_1/cancel', {
        reason: 'Customer aborted',
      });
    });
  });

  describe('Payments Endpoints', () => {
    it('listPayments invokes GET /api/v1/payments with params', async () => {
      (httpClient.get as jest.Mock).mockResolvedValueOnce({ items: [], total: 0 });

      await salesApi.listPayments({ page: 1, limit: 20, status: 'COMPLETED' });

      expect(httpClient.get).toHaveBeenCalledWith('/api/v1/payments', {
        params: expect.objectContaining({ status: 'COMPLETED' }),
      });
    });

    it('getPaymentById invokes GET /api/v1/payments/:id', async () => {
      (httpClient.get as jest.Mock).mockResolvedValueOnce({ id: 'pay_1' });

      await salesApi.getPaymentById('pay_1');

      expect(httpClient.get).toHaveBeenCalledWith('/api/v1/payments/pay_1');
    });

    it('getSalePaymentHistory invokes GET /api/v1/sales/:id/payments', async () => {
      (httpClient.get as jest.Mock).mockResolvedValueOnce([]);

      await salesApi.getSalePaymentHistory('sale_1');

      expect(httpClient.get).toHaveBeenCalledWith('/api/v1/sales/sale_1/payments');
    });

    it('recordPayment invokes POST /api/v1/sales/:id/payments', async () => {
      (httpClient.post as jest.Mock).mockResolvedValueOnce({ id: 'pay_1' });

      await salesApi.recordPayment('sale_1', {
        method: 'CASH',
        amount: 25.0,
      });

      expect(httpClient.post).toHaveBeenCalledWith('/api/v1/sales/sale_1/payments', {
        method: 'CASH',
        amount: 25.0,
      });
    });

    it('settlePayment invokes POST /api/v1/payments/:id/settle', async () => {
      (httpClient.post as jest.Mock).mockResolvedValueOnce({ id: 'pay_1', status: 'COMPLETED' });

      await salesApi.settlePayment('pay_1', { reference: 'GATEWAY_OK' });

      expect(httpClient.post).toHaveBeenCalledWith('/api/v1/payments/pay_1/settle', {
        reference: 'GATEWAY_OK',
      });
    });

    it('cancelPayment invokes POST /api/v1/payments/:id/cancel', async () => {
      (httpClient.post as jest.Mock).mockResolvedValueOnce({ id: 'pay_1', status: 'CANCELLED' });

      await salesApi.cancelPayment('pay_1', { reason: 'Void tender' });

      expect(httpClient.post).toHaveBeenCalledWith('/api/v1/payments/pay_1/cancel', {
        reason: 'Void tender',
      });
    });
  });

  describe('Receipts Endpoints', () => {
    it('getReceiptBySale invokes GET /api/v1/sales/:id/receipt', async () => {
      (httpClient.get as jest.Mock).mockResolvedValueOnce({ id: 'rec_1' });

      await salesApi.getReceiptBySale('sale_1');

      expect(httpClient.get).toHaveBeenCalledWith('/api/v1/sales/sale_1/receipt');
    });

    it('getReceiptById invokes GET /api/v1/receipts/:id', async () => {
      (httpClient.get as jest.Mock).mockResolvedValueOnce({ id: 'rec_1' });

      await salesApi.getReceiptById('rec_1');

      expect(httpClient.get).toHaveBeenCalledWith('/api/v1/receipts/rec_1');
    });

    it('issueReceipt invokes POST /api/v1/sales/:id/receipt', async () => {
      (httpClient.post as jest.Mock).mockResolvedValueOnce({
        id: 'rec_1',
        receiptNumber: 'REC-001',
      });

      await salesApi.issueReceipt('sale_1');

      expect(httpClient.post).toHaveBeenCalledWith('/api/v1/sales/sale_1/receipt', {});
    });

    it('reprintReceipt invokes POST /api/v1/receipts/:id/reprint', async () => {
      (httpClient.post as jest.Mock).mockResolvedValueOnce({
        id: 'rec_1',
        receiptNumber: 'REC-001',
        reprintCount: 1,
      });

      await salesApi.reprintReceipt('rec_1');

      expect(httpClient.post).toHaveBeenCalledWith('/api/v1/receipts/rec_1/reprint', {});
    });
  });

  describe('Sales Origin & Settlement Coordination Endpoints', () => {
    it('assignSaleSource invokes POST /api/v1/sales/:id/source', async () => {
      (httpClient.post as jest.Mock).mockResolvedValueOnce({ id: 'sale_1' });

      const input = {
        sourceReference: {
          type: 'KINESIOLOGY_SESSION',
          referenceId: 'sess_123',
          referenceCode: 'CLN-001',
        },
      };

      await salesApi.assignSaleSource('sale_1', input);

      expect(httpClient.post).toHaveBeenCalledWith('/api/v1/sales/sale_1/source', input);
    });

    it('coordinateSalePayment invokes POST /api/v1/sales/:id/coordinate-payment', async () => {
      (httpClient.post as jest.Mock).mockResolvedValueOnce({ id: 'sale_1', status: 'PAID' });

      await salesApi.coordinateSalePayment('sale_1', { paymentId: 'pay_999' });

      expect(httpClient.post).toHaveBeenCalledWith('/api/v1/sales/sale_1/coordinate-payment', {
        paymentId: 'pay_999',
      });
    });
  });
});
