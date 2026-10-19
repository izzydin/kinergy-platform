import '@testing-library/jest-dom';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { PaymentDetailPage } from '../pages/payment-detail-page';
import { SaleDetailPage } from '../pages/sale-detail-page';
import { SaleCreatePage } from '../pages/sale-create-page';
import { ReceiptViewPage } from '../pages/receipt-view-page';
import { SettlePaymentDialog } from '../components/settle-payment-dialog';
import { RecordPaymentDialog } from '../components/record-payment-dialog';
import { salesApi } from '../api';
import { renderWithProviders } from '../../../test/test-utils';
import {
  toCents,
  centsToDecimal,
  formatMoneyCents,
  evaluateSaleBalances,
  evaluateSettlementConfirmation,
} from '../utils/financial-math';
import type { SaleDTO } from '../types/sales.types';
import type { PaymentDetailDTO } from '../types/payments.types';
import type { ReceiptDTO } from '../types/receipts.types';
import type { AuthUser } from '../../auth/domain/auth-state.types';

jest.mock('../api/sales-api', () => ({
  salesApi: {
    getSaleById: jest.fn(),
    getSalePaymentHistory: jest.fn(),
    getPaymentById: jest.fn(),
    getReceiptBySale: jest.fn(),
    finalizeSale: jest.fn(),
    cancelSale: jest.fn(),
    recordPayment: jest.fn(),
    settlePayment: jest.fn(),
    cancelPayment: jest.fn(),
    createSale: jest.fn(),
    issueReceipt: jest.fn(),
  },
}));

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useParams: jest.fn(),
  };
});

import { useParams } from 'react-router-dom';

const mockManagerUser: AuthUser = {
  id: 'usr_mgr_1',
  email: 'manager@kinergy.test',
  name: 'Store Manager',
  roles: ['Manager'],
  permissions: [
    'sales.read',
    'sales.create',
    'sales.cancel',
    'payments.read',
    'payments.create',
    'payments.manage',
    'receipts.read',
    'receipts.manage',
  ],
  tenantId: 'tenant_1',
};

// Fixture 1: Payable Sale Agreement ($200 Total)
const mockPayableSale: SaleDTO = {
  id: 'sale_payable_001',
  tenantId: 'tenant_1',
  clientId: 'client_alpha',
  currency: 'USD',
  status: 'PENDING_PAYMENT',
  sourceReference: {
    type: 'MEMBERSHIP_PLAN',
    referenceId: 'plan_vip_001',
  },
  subtotal: { amount: 200.0, currency: 'USD', formatted: '$200.00' },
  discountTotal: { amount: 0.0, currency: 'USD', formatted: '$0.00' },
  total: { amount: 200.0, currency: 'USD', formatted: '$200.00' },
  subtotalAmount: 200.0,
  discountTotalAmount: 0.0,
  totalAmount: 200.0,
  itemCount: 1,
  items: [
    {
      id: 'item_1',
      saleId: 'sale_payable_001',
      description: 'Gold Membership',
      skuOrCode: 'VIP-GOLD',
      sourceType: 'MEMBERSHIP_PLAN',
      sourceId: 'plan_vip_001',
      unitPrice: { amount: 200.0, currency: 'USD', formatted: '$200.00' },
      unitPriceAmount: 200.0,
      quantity: 1,
      discountTotal: { amount: 0.0, currency: 'USD', formatted: '$0.00' },
      discountTotalAmount: 0.0,
      subtotal: { amount: 200.0, currency: 'USD', formatted: '$200.00' },
      total: { amount: 200.0, currency: 'USD', formatted: '$200.00' },
      totalAmount: 200.0,
    },
  ],
  version: 1,
  createdAt: '2026-10-18T10:00:00.000Z',
  updatedAt: '2026-10-18T10:00:00.000Z',
};

// Fixture 2: First Pending Payment Tender ($120.00)
const mockPendingPayment1: PaymentDetailDTO = {
  id: 'pay_tender_001',
  saleId: 'sale_payable_001',
  method: 'CARD',
  amount: { amount: 120.0, currency: 'USD', formatted: '$120.00' },
  amountValue: 120.0,
  status: 'PENDING',
  reference: 'DRAWER-01',
  paidAt: null,
  createdAt: '2026-10-18T10:05:00.000Z',
  version: 1,
};

// Fixture 3: Second Pending Payment Tender ($80.00)
const mockPendingPayment2: PaymentDetailDTO = {
  id: 'pay_tender_002',
  saleId: 'sale_payable_001',
  method: 'CASH',
  amount: { amount: 80.0, currency: 'USD', formatted: '$80.00' },
  amountValue: 80.0,
  status: 'PENDING',
  reference: 'COUNTER-CASH',
  paidAt: null,
  createdAt: '2026-10-18T10:06:00.000Z',
  version: 1,
};

// Fixture 4: Settled Payment Record ($120.00)
const mockCompletedPayment1: PaymentDetailDTO = {
  id: 'pay_tender_001',
  saleId: 'sale_payable_001',
  method: 'CARD',
  amount: { amount: 120.0, currency: 'USD', formatted: '$120.00' },
  amountValue: 120.0,
  status: 'COMPLETED',
  reference: 'DRAWER-01',
  paidAt: '2026-10-18T10:10:00.000Z',
  createdAt: '2026-10-18T10:05:00.000Z',
  version: 2,
};

// Fixture 5: Fully Settled Receipt Record
const mockReceipt: ReceiptDTO = {
  id: 'rec_001',
  tenantId: 'tenant_1',
  saleId: 'sale_payable_001',
  receiptNumber: 'RCP-2026-88001',
  saleReference: 'sale_payable_001',
  issuedAt: '2026-10-18T10:15:00.000Z',
  clientSnapshot: {
    clientId: 'client_alpha',
    fullName: 'Alpha Client',
    email: 'alpha@client.test',
    referenceNumber: null,
    phone: null,
  },
  subtotal: { amount: 200.0, currency: 'USD', formatted: '$200.00' },
  discountTotal: { amount: 0.0, currency: 'USD', formatted: '$0.00' },
  total: { amount: 200.0, currency: 'USD', formatted: '$200.00' },
  currency: 'USD',
  itemCount: 1,
  items: [],
  payments: [
    {
      paymentId: 'pay_tender_001',
      method: 'CARD',
      amount: { amount: 120.0, currency: 'USD', formatted: '$120.00' },
      status: 'COMPLETED',
      reference: 'DRAWER-01',
      paidAt: '2026-10-18T10:10:00.000Z',
    },
    {
      paymentId: 'pay_tender_002',
      method: 'CASH',
      amount: { amount: 80.0, currency: 'USD', formatted: '$80.00' },
      status: 'COMPLETED',
      reference: 'COUNTER-CASH',
      paidAt: '2026-10-18T10:12:00.000Z',
    },
  ],
  paymentMethod: 'CARD',
  paymentStatus: 'COMPLETED',
  status: 'ISSUED',
  reprintCount: 0,
};

describe('Phase 7.21 Prompt 5: Financially Unambiguous Payment UX', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });
    jest.clearAllMocks();
  });

  describe('1. Precision-Safe Integer Cents Financial Math', () => {
    it('converts amounts safely to integer cents without floating point drift', () => {
      // 0.1 + 0.2 in standard IEEE-754 is 0.30000000000000004
      const c1 = toCents(0.1);
      const c2 = toCents(0.2);
      expect(c1 + c2).toBe(30);
      expect(centsToDecimal(c1 + c2)).toBe(0.3);
      expect(formatMoneyCents(c1 + c2, 'USD')).toBe('USD 0.30');
    });

    it('evaluates sale balances authoritatively for partial payments and pending tenders', () => {
      const breakdown = evaluateSaleBalances(mockPayableSale, [
        mockCompletedPayment1,
        mockPendingPayment2,
      ]);

      expect(breakdown.totalCents).toBe(20000); // $200.00
      expect(breakdown.completedCents).toBe(12000); // $120.00
      expect(breakdown.pendingCents).toBe(8000); // $80.00
      expect(breakdown.remainingCents).toBe(8000); // $80.00
      expect(breakdown.remainingBalance).toBe(80.0);
      expect(breakdown.isPaidInFull).toBe(false);
      expect(breakdown.hasPendingTenders).toBe(true);
    });

    it('evaluates settlement preview with overpayment detection', () => {
      // Payment amount of $250 against $200 sale
      const overpayingPayment: PaymentDetailDTO = {
        ...mockPendingPayment1,
        amount: { amount: 250.0, currency: 'USD', formatted: '$250.00' },
        amountValue: 250.0,
      };

      const breakdown = evaluateSettlementConfirmation(overpayingPayment, mockPayableSale, []);
      expect(breakdown.isOverpayment).toBe(true);
      expect(breakdown.overpaymentExcessCents).toBe(5000); // $50.00 excess
      expect(breakdown.canSettle).toBe(false);
      expect(breakdown.validationError).toContain('Overpayment detected');
    });

    it('blocks settlement when currency does not match sale agreement', () => {
      const eurPayment: PaymentDetailDTO = {
        ...mockPendingPayment1,
        amount: { amount: 120.0, currency: 'EUR', formatted: '€120.00' },
        amountValue: 120.0,
      };

      const breakdown = evaluateSettlementConfirmation(eurPayment, mockPayableSale, []);
      expect(breakdown.isCurrencyMatch).toBe(false);
      expect(breakdown.canSettle).toBe(false);
      expect(breakdown.validationError).toContain('Currency mismatch');
    });
  });

  describe('2. Workflow 1: Creating a Sale Agreement Does NOT Collect Payment', () => {
    it('displays explicit title, scope disclaimer, and primary button without implying payment collection', async () => {
      renderWithProviders(<SaleCreatePage />, {
        queryClient,
        initialSessionOverride: mockManagerUser,
        initialRoute: '/sales/new',
      });

      // Explicit title
      expect(screen.getByRole('heading', { name: /Create Commercial Sale/i })).toBeInTheDocument();

      // Scope banner disclaiming payment collection
      const scopeBanner = screen.getByTestId('sale-create-scope-banner');
      expect(scopeBanner).toBeInTheDocument();
      expect(scopeBanner).toHaveTextContent(/Commercial Agreement Scope/i);
      expect(scopeBanner).toHaveTextContent(
        /does NOT collect payment tender, charge client payment methods, or settle funds/i,
      );

      // Primary submit action describes initializing draft sale
      const submitBtn = screen.getByTestId('submit-create-sale-btn');
      expect(submitBtn).toHaveTextContent(/Initialize Draft Sale/i);
    });
  });

  describe('3. Workflow 2: Recording a Payment Tender', () => {
    it('clearly labels recording as tender registration and provides tender lifecycle notice', () => {
      const handleConfirm = jest.fn();
      renderWithProviders(
        <RecordPaymentDialog
          open={true}
          onOpenChange={jest.fn()}
          saleId="sale_payable_001"
          defaultAmount={80.0}
          currency="USD"
          onConfirm={handleConfirm}
        />,
        { queryClient },
      );

      // Title describes recording tender
      expect(screen.getByText('Record Payment Tender')).toBeInTheDocument();

      // Tender lifecycle notice
      const notice = screen.getByTestId('tender-lifecycle-notice');
      expect(notice).toBeInTheDocument();
      expect(notice).toHaveTextContent(/Tender Lifecycle Notice/i);
      expect(notice).toHaveTextContent(
        /recorded in PENDING status \(awaiting settlement\) or COMPLETED status depending on the payment rail/i,
      );
      expect(notice).toHaveTextContent(/Tender recording does not mark payment as settled/i);

      // Submit button is specific
      expect(screen.getByTestId('confirm-record-payment-btn')).toHaveTextContent(/Record Tender/i);
    });
  });

  describe('4. Workflow 3: Completing a Payment (Settlement UX)', () => {
    it('presents all four financial values authoritatively before settlement', async () => {
      (useParams as jest.Mock).mockReturnValue({ paymentId: mockPendingPayment1.id });
      (salesApi.getPaymentById as jest.Mock).mockResolvedValue(mockPendingPayment1);
      (salesApi.getSaleById as jest.Mock).mockResolvedValue(mockPayableSale);
      (salesApi.getSalePaymentHistory as jest.Mock).mockResolvedValue([mockPendingPayment1]);

      renderWithProviders(<PaymentDetailPage />, {
        queryClient,
        initialRoute: `/sales/payments/${mockPendingPayment1.id}`,
        initialSessionOverride: mockManagerUser,
      });

      await waitFor(() => {
        expect(screen.getByTestId('page-sale-total')).toHaveTextContent('$200.00');
      });

      // On-page Financial Settlement Summary displays all four values
      expect(screen.getByTestId('payment-settlement-summary-card')).toBeInTheDocument();
      expect(screen.getByTestId('page-payment-amount')).toHaveTextContent('$120.00');
      expect(screen.getByTestId('page-payment-method')).toBeInTheDocument();
      expect(screen.getByTestId('page-remaining-balance')).toHaveTextContent('$80.00');
      expect(screen.getByText(/PARTIAL \(USD 80\.00 Remaining\)/i)).toBeInTheDocument();

      // Open settlement confirmation dialog
      const settleBtn = screen.getByTestId('settle-payment-btn');
      expect(settleBtn).toHaveTextContent('Settle Payment Tender');
      fireEvent.click(settleBtn);

      await waitFor(() => {
        expect(screen.getByTestId('settle-payment-dialog')).toBeInTheDocument();
      });

      // Dialog presents all four values together
      expect(screen.getByTestId('summary-sale-total')).toHaveTextContent('$200.00');
      expect(screen.getByTestId('summary-payment-amount')).toHaveTextContent('$120.00');
      expect(screen.getByTestId('summary-payment-method')).toBeInTheDocument();
      expect(screen.getByTestId('summary-remaining-balance')).toHaveTextContent('$80.00');

      // Visual badge indicates partial balance remaining
      expect(screen.getByTestId('summary-balance-status')).toHaveTextContent('PARTIAL');

      // Final action button has specific meaning
      expect(screen.getByTestId('confirm-settle-payment-btn')).toHaveTextContent(
        'Complete & Settle Payment',
      );
    });

    it('displays PAID IN FULL (Zero Balance) badge when tender satisfies full order', async () => {
      // Sale is $200, already $120 completed, settling $80 tender
      (useParams as jest.Mock).mockReturnValue({ paymentId: mockPendingPayment2.id });
      (salesApi.getPaymentById as jest.Mock).mockResolvedValue(mockPendingPayment2);
      (salesApi.getSaleById as jest.Mock).mockResolvedValue(mockPayableSale);
      (salesApi.getSalePaymentHistory as jest.Mock).mockResolvedValue([
        mockCompletedPayment1,
        mockPendingPayment2,
      ]);

      renderWithProviders(<PaymentDetailPage />, {
        queryClient,
        initialRoute: `/sales/payments/${mockPendingPayment2.id}`,
        initialSessionOverride: mockManagerUser,
      });

      await waitFor(() => {
        expect(screen.getByText('PAID IN FULL (Zero Balance)')).toBeInTheDocument();
      });

      // Projected remaining balance is $0.00
      expect(screen.getByTestId('page-remaining-balance')).toHaveTextContent('$0.00');
    });

    it('blocks completion action and displays safety error when overpayment is detected', async () => {
      const overpayingPayment: PaymentDetailDTO = {
        ...mockPendingPayment1,
        amount: { amount: 350.0, currency: 'USD', formatted: '$350.00' },
        amountValue: 350.0,
      };

      (useParams as jest.Mock).mockReturnValue({ paymentId: overpayingPayment.id });
      (salesApi.getPaymentById as jest.Mock).mockResolvedValue(overpayingPayment);
      (salesApi.getSaleById as jest.Mock).mockResolvedValue(mockPayableSale);
      (salesApi.getSalePaymentHistory as jest.Mock).mockResolvedValue([overpayingPayment]);

      renderWithProviders(<PaymentDetailPage />, {
        queryClient,
        initialRoute: `/sales/payments/${overpayingPayment.id}`,
        initialSessionOverride: mockManagerUser,
      });

      await waitFor(() => {
        expect(screen.getByTestId('page-settlement-blocker-alert')).toHaveTextContent(
          /Overpayment detected/i,
        );
      });

      // Open dialog to verify blocked submission
      fireEvent.click(screen.getByTestId('settle-payment-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('settlement-validation-error')).toBeInTheDocument();
      });

      // Confirm button is disabled
      expect(screen.getByTestId('confirm-settle-payment-btn')).toBeDisabled();
    });

    it('blocks settlement action if payment is already COMPLETED or CANCELLED', async () => {
      (useParams as jest.Mock).mockReturnValue({ paymentId: mockCompletedPayment1.id });
      (salesApi.getPaymentById as jest.Mock).mockResolvedValue(mockCompletedPayment1);
      (salesApi.getSaleById as jest.Mock).mockResolvedValue(mockPayableSale);
      (salesApi.getSalePaymentHistory as jest.Mock).mockResolvedValue([mockCompletedPayment1]);

      renderWithProviders(<PaymentDetailPage />, {
        queryClient,
        initialRoute: `/sales/payments/${mockCompletedPayment1.id}`,
        initialSessionOverride: mockManagerUser,
      });

      await waitFor(() => {
        expect(screen.getByTestId('payment-id')).toHaveTextContent(mockCompletedPayment1.id);
      });

      // Settle button must not be rendered for already completed payments
      expect(screen.queryByTestId('settle-payment-btn')).not.toBeInTheDocument();
      expect(screen.queryByTestId('cancel-payment-btn')).not.toBeInTheDocument();
    });

    it('preserves user context on failure and displays ambiguous network warning', async () => {
      const handleConfirm = jest.fn().mockRejectedValue(new Error('Network connection timeout'));

      renderWithProviders(
        <SettlePaymentDialog
          open={true}
          onOpenChange={jest.fn()}
          payment={mockPendingPayment1}
          sale={mockPayableSale}
          salePayments={[mockPendingPayment1]}
          onConfirm={handleConfirm}
        />,
        { queryClient },
      );

      // Fill in trace reference
      const refInput = screen.getByTestId('settle-reference-input');
      fireEvent.change(refInput, { target: { value: 'POS-DRAWER-99' } });

      // Click complete payment
      fireEvent.click(screen.getByTestId('confirm-settle-payment-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('settle-submission-error')).toBeInTheDocument();
      });

      // Ambiguous outcome alert rendered
      expect(screen.getByText('Ambiguous Network Outcome')).toBeInTheDocument();
      expect(
        screen.getByText(/please inspect the Payments Log before attempting to re-submit/i),
      ).toBeInTheDocument();

      // Reference input preserved (context not discarded)
      expect(refInput).toHaveValue('POS-DRAWER-99');
    });
  });

  describe('5. Workflow 4: Viewing a Receipt is Read-Only', () => {
    it('displays receipt document title, read-only proof-of-purchase disclaimer, and does not alter payment state', async () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: mockPayableSale.id });
      (salesApi.getReceiptBySale as jest.Mock).mockResolvedValue(mockReceipt);

      renderWithProviders(<ReceiptViewPage />, {
        queryClient,
        initialRoute: `/sales/${mockPayableSale.id}/receipt`,
        initialSessionOverride: mockManagerUser,
      });

      await waitFor(() => {
        expect(screen.getByTestId('receipt-page-title')).toHaveTextContent(
          'Official Receipt Document',
        );
      });

      // Proof of purchase disclaimer
      const disclaimer = screen.getByTestId('receipt-audit-disclaimer');
      expect(disclaimer).toBeInTheDocument();
      expect(disclaimer).toHaveTextContent(
        /strictly read-only and does not create, settle, or alter server payment records or transaction lifecycle states/i,
      );
    });

    it('distinguishes unavailable/unissued receipt from completed receipt', async () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: 'sale_unsettled_99' });
      const err = new Error('Receipt not found');
      (err as unknown as Record<string, unknown>).status = 404;
      (salesApi.getReceiptBySale as jest.Mock).mockRejectedValue(err);

      renderWithProviders(<ReceiptViewPage />, {
        queryClient,
        initialRoute: '/sales/sale_unsettled_99/receipt',
        initialSessionOverride: mockManagerUser,
      });

      await waitFor(() => {
        expect(screen.getByTestId('receipt-not-issued')).toBeInTheDocument();
      });

      expect(screen.getByText('Receipt Not Issued Yet')).toBeInTheDocument();
      expect(
        screen.getByText(
          /official receipts are generated only after a sale order is fully settled/i,
        ),
      ).toBeInTheDocument();
    });
  });

  describe('6. Sale Detail Outstanding Balance Integration', () => {
    it('distinguishes settled tenders, pending tenders, and remaining balance with unambiguous badges', async () => {
      (useParams as jest.Mock).mockReturnValue({ saleId: mockPayableSale.id });
      (salesApi.getSaleById as jest.Mock).mockResolvedValue(mockPayableSale);
      (salesApi.getSalePaymentHistory as jest.Mock).mockResolvedValue([
        mockCompletedPayment1,
        mockPendingPayment2,
      ]);

      renderWithProviders(<SaleDetailPage />, {
        queryClient,
        initialRoute: `/sales/${mockPayableSale.id}`,
        initialSessionOverride: mockManagerUser,
      });

      await waitFor(() => {
        expect(screen.getByTestId('sale-id')).toHaveTextContent(mockPayableSale.id);
      });

      // Net total: $200.00
      expect(screen.getByTestId('sale-total')).toHaveTextContent('$200.00');

      // Settled tenders: $120.00
      expect(screen.getByText('Settled Tenders:')).toBeInTheDocument();
      expect(screen.getByText('USD 120.00')).toBeInTheDocument();

      // Pending tenders: $80.00
      expect(screen.getByText('Pending Settlement:')).toBeInTheDocument();
      expect(screen.getAllByText('USD 80.00')[0]).toBeInTheDocument();

      // Remaining balance: $80.00 with badge
      expect(screen.getByText('OUTSTANDING BALANCE (USD 80.00)')).toBeInTheDocument();
    });
  });
});
