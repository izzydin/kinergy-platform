import '@testing-library/jest-dom';
import { screen, waitFor, fireEvent, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';

// Polyfill Request if undefined in jsdom environment for @remix-run/router
if (typeof global.Request === 'undefined') {
  global.Request = class Request {} as unknown as typeof Request;
}
import { SaleCreatePage } from '../pages/sale-create-page';
import { RecordPaymentDialog } from '../components/record-payment-dialog';
import { CancelSaleDialog } from '../components/cancel-sale-dialog';
import { CancelPaymentDialog } from '../components/cancel-payment-dialog';
import { salesApi } from '../api';
import {
  AuthProvider,
  ThemeProvider,
  NotificationProvider,
  LocaleProvider,
  FeatureFlagProvider,
} from '../../../app/providers';
import { ValidationError } from '../../../shared/query';
import type { AuthUser } from '../../auth/domain/auth-state.types';
import type { SaleDTO } from '../types/sales.types';

// Mock API
jest.mock('../api/sales-api', () => ({
  salesApi: {
    createSale: jest.fn(),
  },
}));

const mockStaffUser: AuthUser = {
  id: 'usr_staff_1',
  email: 'cashier@kinergy.test',
  name: 'Front Desk Cashier',
  roles: ['Receptionist'],
  permissions: [
    'sales.read',
    'sales.create',
    'sales.cancel',
    'payments.read',
    'payments.create',
    'payments.manage',
  ],
  tenantId: 'tenant_1',
};

const mockCreatedSale: SaleDTO = {
  id: 'sale_01j9999888877776666555544',
  tenantId: 'tenant_1',
  clientId: 'cli_123',
  currency: 'USD',
  status: 'DRAFT',
  subtotal: { amount: 30.0, currency: 'USD', formatted: '$30.00' },
  discountTotal: { amount: 0, currency: 'USD', formatted: '$0.00' },
  total: { amount: 30.0, currency: 'USD', formatted: '$30.00' },
  subtotalAmount: 30.0,
  discountTotalAmount: 0,
  totalAmount: 30.0,
  itemCount: 1,
  items: [],
  version: 1,
  createdAt: '2026-10-17T12:00:00.000Z',
  updatedAt: '2026-10-17T12:00:00.000Z',
  completedAt: null,
  cancelledAt: null,
  cancellationReason: null,
  refundedAt: null,
};

function renderWithDataRouter(
  initialRoute = '/sales/new',
  queryClient: QueryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  }),
) {
  const router = createMemoryRouter(
    [
      {
        path: '/sales/new',
        element: <SaleCreatePage />,
      },
      {
        path: '/sales/list',
        element: <div data-testid="sales-directory-page">Sales Directory Destination</div>,
      },
      {
        path: '/sales/:id',
        element: <div data-testid="sale-detail-page">Sale Detail Destination</div>,
      },
    ],
    {
      initialEntries: [initialRoute],
      initialIndex: 0,
    },
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark">
        <NotificationProvider>
          <AuthProvider initialSessionOverride={mockStaffUser} skipBootstrap={true}>
            <LocaleProvider>
              <FeatureFlagProvider>
                <RouterProvider router={router} />
              </FeatureFlagProvider>
            </LocaleProvider>
          </AuthProvider>
        </NotificationProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe('Financial Form Safety & Submission Protection (Prompt 4)', () => {
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

  describe('1. SaleCreatePage Validation & Field Level Feedback', () => {
    it('enforces required line item description and monetary precision', async () => {
      renderWithDataRouter('/sales/new', queryClient);

      // Attempt submit without description
      const submitBtn = screen.getByTestId('submit-create-sale-btn');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/Item description is required/i)).toBeInTheDocument();
      });

      // API must NOT have been called
      expect(salesApi.createSale).not.toHaveBeenCalled();

      // Enter negative price and submit
      const priceInput = screen.getByTestId('item-price-0');
      fireEvent.change(priceInput, { target: { value: '-10' } });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/Unit price cannot be negative/i)).toBeInTheDocument();
      });
    });

    it('validates currency code regex formatting and accessible ARIA attributes', async () => {
      renderWithDataRouter('/sales/new', queryClient);

      const currencyInput = screen.getByTestId('sale-currency-input');
      fireEvent.change(currencyInput, { target: { value: 'us' } });

      const submitBtn = screen.getByTestId('submit-create-sale-btn');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/Currency must be a 3-letter ISO code/i)).toBeInTheDocument();
      });

      expect(currencyInput).toHaveAttribute('aria-invalid', 'true');
      expect(currencyInput).toHaveAttribute('aria-describedby', 'currency-error');
    });

    it('maps server ValidationError details to field level errors via useApplyServerErrors', async () => {
      const serverValidationError = new ValidationError('Server payload rejected', {
        currency: ['Unsupported currency code for current commercial region'],
      });
      (salesApi.createSale as jest.Mock).mockRejectedValueOnce(serverValidationError);

      renderWithDataRouter('/sales/new', queryClient);

      fireEvent.change(screen.getByTestId('item-desc-0'), { target: { value: 'Valid Item' } });
      fireEvent.change(screen.getByTestId('item-price-0'), { target: { value: '50.00' } });

      fireEvent.click(screen.getByTestId('submit-create-sale-btn'));

      await waitFor(() => {
        expect(
          screen.getByText(/Unsupported currency code for current commercial region/i),
        ).toBeInTheDocument();
      });

      expect(screen.getByTestId('sale-currency-input')).toHaveAttribute('aria-invalid', 'true');
    });

    it('supports keyboard form submission via Enter key', async () => {
      (salesApi.createSale as jest.Mock).mockResolvedValueOnce(mockCreatedSale);

      renderWithDataRouter('/sales/new', queryClient);

      const descInput = screen.getByTestId('item-desc-0');
      fireEvent.change(descInput, { target: { value: 'Keyboard Added Item' } });
      fireEvent.change(screen.getByTestId('item-price-0'), { target: { value: '25.00' } });

      // Press Enter inside description field to submit form
      fireEvent.keyDown(descInput, { key: 'Enter', code: 'Enter', charCode: 13 });
      const form = descInput.closest('form');
      if (form) {
        fireEvent.submit(form);
      }

      await waitFor(() => {
        expect(salesApi.createSale).toHaveBeenCalledTimes(1);
      });
    });

    it('guards against rapid duplicate activations while submission is pending', async () => {
      let resolveApi: (value: SaleDTO) => void;
      const deferredPromise = new Promise<SaleDTO>((resolve) => {
        resolveApi = resolve;
      });
      (salesApi.createSale as jest.Mock).mockReturnValue(deferredPromise);

      renderWithDataRouter('/sales/new', queryClient);

      fireEvent.change(screen.getByTestId('item-desc-0'), { target: { value: 'Safe Item' } });
      fireEvent.change(screen.getByTestId('item-price-0'), { target: { value: '15.00' } });

      const submitBtn = screen.getByTestId('submit-create-sale-btn');

      // Click once
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(submitBtn).toBeDisabled();
        expect(submitBtn).toHaveTextContent(/Initializing Draft Sale.../i);
      });

      // Rapid repeated clicks while pending
      fireEvent.click(submitBtn);
      fireEvent.click(submitBtn);

      expect(salesApi.createSale).toHaveBeenCalledTimes(1);

      // Resolve pending call
      resolveApi!(mockCreatedSale);

      await waitFor(() => {
        expect(screen.getByTestId('sale-detail-page')).toBeInTheDocument();
      });
    });
  });

  describe('2. SaleCreatePage Dirty Form Navigation Protection', () => {
    it('allows clean navigation without warning when form is untouched', async () => {
      renderWithDataRouter('/sales/new', queryClient);

      // Untouched form — click Back to Directory
      const backLink = screen.getByTestId('back-to-directory-btn');
      fireEvent.click(backLink);

      await waitFor(() => {
        expect(screen.getByTestId('sales-directory-page')).toBeInTheDocument();
      });

      // ConfirmDiscardDialog should NOT be open
      expect(screen.queryByText(/Discard new sale draft\?/i)).not.toBeInTheDocument();
    });

    it('intercepts navigation when form is dirty, allows cancellation to keep editing', async () => {
      renderWithDataRouter('/sales/new', queryClient);

      // Make form dirty by editing item description
      const descInput = screen.getByTestId('item-desc-0');
      fireEvent.change(descInput, { target: { value: 'Unsaved Workout Shake' } });

      // Attempt navigation to directory
      const backLink = screen.getByTestId('back-to-directory-btn');
      fireEvent.click(backLink);

      // ConfirmDiscardDialog is displayed
      await waitFor(() => {
        expect(screen.getByText(/Discard new sale draft\?/i)).toBeInTheDocument();
      });

      // User chooses "Keep editing" (Cancel)
      const keepEditingBtn = screen.getByRole('button', { name: /Keep editing/i });
      fireEvent.click(keepEditingBtn);

      await waitFor(() => {
        expect(screen.queryByText(/Discard new sale draft\?/i)).not.toBeInTheDocument();
      });

      // Still on create page with input preserved
      expect(screen.getByTestId('sale-create-page')).toBeInTheDocument();
      expect(screen.getByTestId('item-desc-0')).toHaveValue('Unsaved Workout Shake');
    });

    it('proceeds with navigation when user confirms discard', async () => {
      renderWithDataRouter('/sales/new', queryClient);

      fireEvent.change(screen.getByTestId('item-desc-0'), { target: { value: 'To Be Discarded' } });

      const cancelBtn = screen.getByTestId('cancel-create-sale-btn');
      fireEvent.click(cancelBtn);

      await waitFor(() => {
        expect(screen.getByText(/Discard new sale draft\?/i)).toBeInTheDocument();
      });

      // Confirm discard
      const discardBtn = screen.getByRole('button', { name: /Discard changes/i });
      fireEvent.click(discardBtn);

      await waitFor(() => {
        expect(screen.getByTestId('sales-directory-page')).toBeInTheDocument();
      });
    });

    it('resets dirty protection after confirmed successful submission', async () => {
      (salesApi.createSale as jest.Mock).mockResolvedValueOnce(mockCreatedSale);

      renderWithDataRouter('/sales/new', queryClient);

      fireEvent.change(screen.getByTestId('item-desc-0'), { target: { value: 'Confirmed Item' } });
      fireEvent.change(screen.getByTestId('item-price-0'), { target: { value: '45.00' } });

      fireEvent.click(screen.getByTestId('submit-create-sale-btn'));

      // Successfully transitions to detail page without being blocked
      await waitFor(() => {
        expect(screen.getByTestId('sale-detail-page')).toBeInTheDocument();
      });

      expect(screen.queryByText(/Discard new sale draft\?/i)).not.toBeInTheDocument();
    });

    it('preserves form inputs and keeps dirty guard active after recoverable server error', async () => {
      (salesApi.createSale as jest.Mock).mockRejectedValueOnce(
        new Error('Payment gateway service unavailable'),
      );

      renderWithDataRouter('/sales/new', queryClient);

      fireEvent.change(screen.getByTestId('item-desc-0'), {
        target: { value: 'Preserved Line Item' },
      });
      fireEvent.change(screen.getByTestId('item-price-0'), { target: { value: '80.00' } });

      fireEvent.click(screen.getByTestId('submit-create-sale-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('sale-create-error')).toBeInTheDocument();
      });

      // Input remains intact for retry
      expect(screen.getByTestId('item-desc-0')).toHaveValue('Preserved Line Item');
      expect(screen.getByTestId('item-price-0')).toHaveValue(80);
    });
  });

  describe('3. RecordPaymentDialog Form Safety & Dirty Guard', () => {
    it('closes immediately without warning when untouched', () => {
      const onOpenChange = jest.fn();
      const onConfirm = jest.fn();

      render(
        <RecordPaymentDialog
          open={true}
          onOpenChange={onOpenChange}
          saleId="sale_101"
          defaultAmount={50}
          onConfirm={onConfirm}
        />,
      );

      // Click Cancel button
      const cancelBtn = screen.getByRole('button', { name: /^Cancel$/i });
      fireEvent.click(cancelBtn);

      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(screen.queryByText(/Discard payment tender changes\?/i)).not.toBeInTheDocument();
    });

    it('intercepts closing when user modified tender input and allows cancellation', async () => {
      const onOpenChange = jest.fn();
      const onConfirm = jest.fn();

      render(
        <RecordPaymentDialog
          open={true}
          onOpenChange={onOpenChange}
          saleId="sale_101"
          defaultAmount={50}
          onConfirm={onConfirm}
        />,
      );

      // Modify reference field to make form dirty
      const refInput = screen.getByPlaceholderText(/e.g. DRAWER-01, POS-REF-892/i);
      fireEvent.change(refInput, { target: { value: 'DRAWER-DRAWER-99' } });

      // Click Cancel
      const cancelBtn = screen.getByRole('button', { name: /^Cancel$/i });
      fireEvent.click(cancelBtn);

      // Does not close immediately; shows ConfirmDiscardDialog
      expect(onOpenChange).not.toHaveBeenCalled();
      expect(screen.getByText(/Discard payment tender changes\?/i)).toBeInTheDocument();

      // Click "Keep editing"
      const keepEditingBtn = screen.getByRole('button', { name: /Keep editing/i });
      fireEvent.click(keepEditingBtn);

      expect(screen.queryByText(/Discard payment tender changes\?/i)).not.toBeInTheDocument();
      expect(onOpenChange).not.toHaveBeenCalled();
      expect(refInput).toHaveValue('DRAWER-DRAWER-99');
    });

    it('proceeds with discard when user confirms in RecordPaymentDialog', async () => {
      const onOpenChange = jest.fn();
      const onConfirm = jest.fn();

      render(
        <RecordPaymentDialog
          open={true}
          onOpenChange={onOpenChange}
          saleId="sale_101"
          defaultAmount={50}
          onConfirm={onConfirm}
        />,
      );

      const refInput = screen.getByPlaceholderText(/e.g. DRAWER-01, POS-REF-892/i);
      fireEvent.change(refInput, { target: { value: 'TEMP-REF' } });

      fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }));

      const discardBtn = screen.getByRole('button', { name: /Discard changes/i });
      fireEvent.click(discardBtn);

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('prevents double-click activation while isSubmitting is true', async () => {
      const onOpenChange = jest.fn();
      const onConfirm = jest.fn();

      render(
        <RecordPaymentDialog
          open={true}
          onOpenChange={onOpenChange}
          saleId="sale_101"
          defaultAmount={50}
          isSubmitting={true}
          onConfirm={onConfirm}
        />,
      );

      const submitBtn = screen.getByTestId('confirm-record-payment-btn');
      expect(submitBtn).toBeDisabled();
      expect(submitBtn).toHaveTextContent(/Recording.../i);

      fireEvent.click(submitBtn);
      expect(onConfirm).not.toHaveBeenCalled();
    });
  });

  describe('4. CancelSaleDialog Form Safety & Dirty Guard', () => {
    it('validates minimum reason length and preserves reason upon server error', async () => {
      const onOpenChange = jest.fn();
      const onConfirm = jest
        .fn()
        .mockRejectedValue(new Error('State transition rejected by backend'));

      render(
        <CancelSaleDialog
          open={true}
          onOpenChange={onOpenChange}
          saleId="sale_202"
          onConfirm={onConfirm}
        />,
      );

      const reasonInput = screen.getByTestId('cancellation-reason-input');
      const submitBtn = screen.getByTestId('confirm-cancel-sale-btn');

      // Short reason (< 3 chars)
      fireEvent.change(reasonInput, { target: { value: 'no' } });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/Cancellation reason must be at least 3 characters/i),
        ).toBeInTheDocument();
      });
      expect(onConfirm).not.toHaveBeenCalled();

      // Valid reason but server rejects
      fireEvent.change(reasonInput, { target: { value: 'Customer returned items' } });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByTestId('cancel-sale-error')).toBeInTheDocument();
      });

      // Reason is preserved in the input
      expect(reasonInput).toHaveValue('Customer returned items');
    });

    it('protects unsaved reason with ConfirmDiscardDialog', async () => {
      const onOpenChange = jest.fn();
      const onConfirm = jest.fn();

      render(
        <CancelSaleDialog
          open={true}
          onOpenChange={onOpenChange}
          saleId="sale_202"
          onConfirm={onConfirm}
        />,
      );

      const reasonInput = screen.getByTestId('cancellation-reason-input');
      fireEvent.change(reasonInput, { target: { value: 'Draft cancellation reason' } });

      const backBtn = screen.getByRole('button', { name: /^Back$/i });
      fireEvent.click(backBtn);

      expect(screen.getByText(/Discard cancellation reason\?/i)).toBeInTheDocument();
      expect(onOpenChange).not.toHaveBeenCalled();
    });
  });

  describe('5. CancelPaymentDialog Form Safety & Dirty Guard', () => {
    it('closes without prompt when default reason is unmodified', () => {
      const onOpenChange = jest.fn();
      const onConfirm = jest.fn();

      render(
        <CancelPaymentDialog
          open={true}
          onOpenChange={onOpenChange}
          paymentId="pay_909"
          amountFormatted="$50.00"
          onConfirm={onConfirm}
        />,
      );

      const keepBtn = screen.getByRole('button', { name: /Keep Tender/i });
      fireEvent.click(keepBtn);

      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(screen.queryByText(/Discard void reason changes\?/i)).not.toBeInTheDocument();
    });

    it('warns when void reason is customized and user attempts to cancel', () => {
      const onOpenChange = jest.fn();
      const onConfirm = jest.fn();

      render(
        <CancelPaymentDialog
          open={true}
          onOpenChange={onOpenChange}
          paymentId="pay_909"
          amountFormatted="$50.00"
          onConfirm={onConfirm}
        />,
      );

      const reasonInput = screen.getByTestId('void-payment-reason-input');
      fireEvent.change(reasonInput, { target: { value: 'Custom manager override reason' } });

      const keepBtn = screen.getByRole('button', { name: /Keep Tender/i });
      fireEvent.click(keepBtn);

      expect(screen.getByText(/Discard void reason changes\?/i)).toBeInTheDocument();
      expect(onOpenChange).not.toHaveBeenCalled();
    });
  });
});
