import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CompleteSessionModal } from '../components/complete-session-modal';
import * as useTreatmentSessionHook from '../hooks/use-treatment-session';
import * as useTreatmentMutationsHook from '../hooks/use-treatment-mutations';

jest.mock('../hooks/use-treatment-session');
jest.mock('../hooks/use-treatment-mutations');

describe('CompleteSessionModal - Therapist-Led Checkout Workflow', () => {
  const mockBillingInfo = {
    sessionId: 'sess_123',
    appointmentId: 'appt_001',
    clientId: 'cli_456',
    clientFullName: 'Carlos Rivera',
    therapistId: 'therapist_789',
    sessionStatus: 'IN_PROGRESS',
    serviceType: 'TREATMENT',
    serviceDescription: 'Standard Kinesiology Treatment Session',
    price: {
      amount: 85,
      currency: 'USD',
      formatted: '$85.00 USD',
    },
    isAlreadyPaid: false,
    paymentStatus: 'UNPAID' as const,
  };

  const mockMutateAsync = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    (useTreatmentSessionHook.useSessionBillingInfo as jest.Mock).mockReturnValue({
      data: mockBillingInfo,
      isLoading: false,
    });

    (useTreatmentMutationsHook.useTreatmentMutations as jest.Mock).mockReturnValue({
      checkoutSession: {
        mutateAsync: mockMutateAsync,
        isPending: false,
        error: null,
      },
    });
  });

  it('renders client full name, treatment description, and authoritative fee from billing info', () => {
    render(
      <MemoryRouter>
        <CompleteSessionModal isOpen={true} sessionId="sess_123" onClose={jest.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('billing-client-display')).toHaveTextContent('Carlos Rivera');
    expect(screen.getByTestId('billing-price-display')).toHaveTextContent('$85.00 USD');
    expect(screen.getByText('Standard Kinesiology Treatment Session')).toBeInTheDocument();
  });

  describe('Option A: Complete & Collect Payment', () => {
    it('supports CASH tender and calculates change dynamically', () => {
      render(
        <MemoryRouter>
          <CompleteSessionModal isOpen={true} sessionId="sess_123" onClose={jest.fn()} />
        </MemoryRouter>,
      );

      // Default is COLLECT_PAYMENT and CASH
      expect(screen.getByTestId('payment-method-cash-btn')).toBeInTheDocument();

      const tenderInput = screen.getByTestId('cash-tendered-input');
      // Client tenders $100 for an $85 treatment
      fireEvent.change(tenderInput, { target: { value: '100.00' } });

      const changeDisplay = screen.getByTestId('cash-change-display');
      expect(changeDisplay).toHaveTextContent('Change Due:');
      expect(changeDisplay).toHaveTextContent('$15.00');
    });

    it('submits checkout request with CASH tender and shows success view with receipt link', async () => {
      mockMutateAsync.mockResolvedValueOnce({
        success: true,
        sessionId: 'sess_123',
        sessionStatus: 'COMPLETED',
        saleId: 'sale_999',
        saleStatus: 'PAID',
        paymentId: 'pay_888',
        paymentStatus: 'COMPLETED',
        paymentMethod: 'CASH',
        receiptId: 'rcpt_777',
        receiptNumber: 'RCP-2026-0001',
        amount: 8500,
        currency: 'USD',
        clientFullName: 'Carlos Rivera',
        paidAt: '2026-11-10T20:00:00.000Z',
      });

      render(
        <MemoryRouter>
          <CompleteSessionModal isOpen={true} sessionId="sess_123" onClose={jest.fn()} />
        </MemoryRouter>,
      );

      const completeBtn = screen.getByTestId('sign-and-complete-btn');
      fireEvent.click(completeBtn);

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          flowOption: 'COLLECT_PAYMENT',
          paymentMethod: 'CASH',
          paymentReference: undefined,
        });
      });

      // Verifies success state view
      expect(await screen.findByTestId('checkout-success-view')).toBeInTheDocument();
      expect(screen.getByText('Treatment Encounter Finalized & Settled')).toBeInTheDocument();
      expect(screen.getByText('#RCP-2026-0001')).toBeInTheDocument();
      expect(screen.getByTestId('modal-view-receipt-btn')).toBeInTheDocument();
    });

    it('supports selecting QR payment method and submitting reference code', async () => {
      mockMutateAsync.mockResolvedValueOnce({
        success: true,
        sessionId: 'sess_123',
        sessionStatus: 'COMPLETED',
        saleId: 'sale_999',
        saleStatus: 'PAID',
        paymentId: 'pay_qr_888',
        paymentStatus: 'COMPLETED',
        paymentMethod: 'QR',
        amount: 8500,
        currency: 'USD',
        clientFullName: 'Carlos Rivera',
        paidAt: '2026-11-10T20:00:00.000Z',
      });

      render(
        <MemoryRouter>
          <CompleteSessionModal isOpen={true} sessionId="sess_123" onClose={jest.fn()} />
        </MemoryRouter>,
      );

      // Select QR payment method
      const qrBtn = screen.getByTestId('payment-method-qr-btn');
      fireEvent.click(qrBtn);

      // Enter reference code
      const refInput = screen.getByTestId('payment-reference-input');
      fireEvent.change(refInput, { target: { value: 'QR-TX-5544' } });

      const completeBtn = screen.getByTestId('sign-and-complete-btn');
      fireEvent.click(completeBtn);

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          flowOption: 'COLLECT_PAYMENT',
          paymentMethod: 'QR',
          paymentReference: 'QR-TX-5544',
        });
      });
    });
  });

  describe('Option B: Complete Treatment (Already Paid)', () => {
    it('disables Option B and warns user if appointment is not yet paid', () => {
      render(
        <MemoryRouter>
          <CompleteSessionModal isOpen={true} sessionId="sess_123" onClose={jest.fn()} />
        </MemoryRouter>,
      );

      // Select Option B
      const optionBRadio = screen.getByTestId('flow-already-paid-radio');
      fireEvent.click(optionBRadio);

      // Warning should be displayed
      expect(screen.getByText('No Prior Payment Found')).toBeInTheDocument();

      // Submit button should be disabled because payment is not verified
      const completeBtn = screen.getByTestId('sign-and-complete-btn');
      expect(completeBtn).toBeDisabled();
    });

    it('enables Option B when payment was already settled upfront', async () => {
      (useTreatmentSessionHook.useSessionBillingInfo as jest.Mock).mockReturnValue({
        data: {
          ...mockBillingInfo,
          isAlreadyPaid: true,
          paymentStatus: 'PAID',
          existingSaleId: 'sale_upfront_1',
          existingReceiptNumber: 'RCP-UPFRONT-01',
        },
        isLoading: false,
      });

      mockMutateAsync.mockResolvedValueOnce({
        success: true,
        sessionId: 'sess_123',
        sessionStatus: 'COMPLETED',
        saleId: 'sale_upfront_1',
        saleStatus: 'PAID',
        receiptNumber: 'RCP-UPFRONT-01',
        amount: 8500,
        currency: 'USD',
        clientFullName: 'Carlos Rivera',
        paidAt: '2026-11-10T19:00:00.000Z',
      });

      render(
        <MemoryRouter>
          <CompleteSessionModal isOpen={true} sessionId="sess_123" onClose={jest.fn()} />
        </MemoryRouter>,
      );

      expect(screen.getByText('✓ Verified Settled Payment')).toBeInTheDocument();

      const completeBtn = screen.getByTestId('sign-and-complete-btn');
      expect(completeBtn).not.toBeDisabled();
      fireEvent.click(completeBtn);

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          flowOption: 'ALREADY_PAID',
          paymentMethod: undefined,
          paymentReference: undefined,
        });
      });
    });
  });
});
