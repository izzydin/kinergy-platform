import '@testing-library/jest-dom';
import { screen, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { SaleCreatePage } from '../pages/sale-create-page';
import { salesApi } from '../api';
import { renderWithProviders } from '../../../test/test-utils';
import type { AuthUser } from '../../auth/domain/auth-state.types';
import type { SaleDTO } from '../types/sales.types';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

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
  permissions: ['sales.read', 'sales.create'],
  tenantId: 'tenant_1',
};

const mockReadOnlyUser: AuthUser = {
  id: 'usr_readonly_1',
  email: 'readonly@kinergy.test',
  name: 'Auditor',
  roles: ['Auditor'],
  permissions: ['sales.read'],
  tenantId: 'tenant_1',
};

const mockCreatedSale: SaleDTO = {
  id: 'sale_01j9999888877776666555544',
  tenantId: 'tenant_1',
  clientId: 'cli_123',
  currency: 'USD',
  status: 'DRAFT',
  sourceReference: {
    type: 'INVENTORY_ITEM',
    referenceId: 'inv_101',
    referenceCode: 'PROT_BAR',
  },
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

describe('SaleCreatePage Workflow & Contract Verification', () => {
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

  describe('1. Initial State & Source Selection', () => {
    it('renders form with default USD currency and walk-in source selection', () => {
      renderWithProviders(<SaleCreatePage />, {
        queryClient,
        initialRoute: '/sales/new',
        initialSessionOverride: mockStaffUser,
      });

      expect(screen.getByTestId('sale-create-page')).toBeInTheDocument();
      expect(screen.getByTestId('sale-currency-input')).toHaveValue('USD');
      expect(screen.getByTestId('sale-client-id-input')).toHaveValue('');

      // Walk-in radio is checked by default
      const walkInRadio = screen.getByTestId('origin-walkin-radio');
      expect(walkInRadio).toBeChecked();

      // Source reference fields should not be visible for walk-in
      expect(screen.queryByTestId('source-reference-fields')).not.toBeInTheDocument();

      // Initial line item is present
      expect(screen.getByTestId('line-item-row-0')).toBeInTheDocument();
    });

    it('toggles upstream entity reference fields with supported source types', () => {
      renderWithProviders(<SaleCreatePage />, {
        queryClient,
        initialRoute: '/sales/new',
        initialSessionOverride: mockStaffUser,
      });

      // Switch to Upstream Entity Reference
      const sourceRadio = screen.getByTestId('origin-source-radio');
      fireEvent.click(sourceRadio);

      expect(screen.getByTestId('source-reference-fields')).toBeInTheDocument();

      // Source type select contains supported source types
      const typeSelect = screen.getByTestId('source-type-select');
      expect(typeSelect).toHaveValue('INVENTORY_ITEM');
      expect(
        within(typeSelect).getByRole('option', { name: /TREATMENT SESSION/i }),
      ).toBeInTheDocument();
      expect(
        within(typeSelect).getByRole('option', { name: /MEMBERSHIP PLAN/i }),
      ).toBeInTheDocument();
    });
  });

  describe('2. Client-Side Validation & Safeguards', () => {
    it('validates required fields: item description cannot be empty', async () => {
      renderWithProviders(<SaleCreatePage />, {
        queryClient,
        initialRoute: '/sales/new',
        initialSessionOverride: mockStaffUser,
      });

      const submitBtn = screen.getByTestId('submit-create-sale-btn');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText('Item description is required')).toBeInTheDocument();
      });

      // API should not be called
      expect(salesApi.createSale).not.toHaveBeenCalled();
    });

    it('validates numeric bounds: rejects negative unit price and invalid quantity', async () => {
      renderWithProviders(<SaleCreatePage />, {
        queryClient,
        initialRoute: '/sales/new',
        initialSessionOverride: mockStaffUser,
      });

      fireEvent.change(screen.getByTestId('item-desc-0'), { target: { value: 'Valid Item' } });
      fireEvent.change(screen.getByTestId('item-price-0'), { target: { value: '-10' } });
      fireEvent.change(screen.getByTestId('item-quantity-0'), { target: { value: '0' } });

      const submitBtn = screen.getByTestId('submit-create-sale-btn');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText('Unit price cannot be negative')).toBeInTheDocument();
        expect(screen.getByText('Quantity must be at least 0.001')).toBeInTheDocument();
      });

      expect(salesApi.createSale).not.toHaveBeenCalled();
    });

    it('dynamically adds and removes line items', () => {
      renderWithProviders(<SaleCreatePage />, {
        queryClient,
        initialRoute: '/sales/new',
        initialSessionOverride: mockStaffUser,
      });

      expect(screen.getByTestId('line-item-row-0')).toBeInTheDocument();
      expect(screen.queryByTestId('line-item-row-1')).not.toBeInTheDocument();

      // Add second item
      const addBtn = screen.getByTestId('add-line-item-btn');
      fireEvent.click(addBtn);

      expect(screen.getByTestId('line-item-row-1')).toBeInTheDocument();

      // Remove first item
      const removeBtn = screen.getByTestId('remove-line-item-0');
      fireEvent.click(removeBtn);

      expect(screen.queryByTestId('line-item-row-1')).not.toBeInTheDocument();
    });
  });

  describe('3. Financial Safety & Preview Calculation', () => {
    it('displays client calculation preview with explicit non-authoritative policy disclosure', async () => {
      renderWithProviders(<SaleCreatePage />, {
        queryClient,
        initialRoute: '/sales/new',
        initialSessionOverride: mockStaffUser,
      });

      // Fill in item price and quantity
      fireEvent.change(screen.getByTestId('item-desc-0'), { target: { value: 'Fitness Shake' } });
      fireEvent.change(screen.getByTestId('item-price-0'), { target: { value: '15.50' } });
      fireEvent.change(screen.getByTestId('item-quantity-0'), { target: { value: '2' } });

      // Non-authoritative disclosure is present
      expect(screen.getByText(/Authoritative Totals Policy:/i)).toBeInTheDocument();

      // Preview subtotal updates (15.50 * 2 = 31.00)
      await waitFor(() => {
        expect(screen.getByTestId('preview-subtotal')).toHaveTextContent('USD 31.00');
        expect(screen.getByTestId('preview-total')).toHaveTextContent('USD 31.00');
      });
    });
  });

  describe('4. Submission Payload Mapping & Navigation', () => {
    it('submits valid payload with idempotency key and navigates to created sale detail route', async () => {
      (salesApi.createSale as jest.Mock).mockResolvedValue(mockCreatedSale);

      renderWithProviders(<SaleCreatePage />, {
        queryClient,
        initialRoute: '/sales/new',
        initialSessionOverride: mockStaffUser,
      });

      // Fill in details
      fireEvent.change(screen.getByTestId('sale-client-id-input'), {
        target: { value: 'cli_123' },
      });
      fireEvent.change(screen.getByTestId('item-desc-0'), { target: { value: 'Whey Protein' } });
      fireEvent.change(screen.getByTestId('item-price-0'), { target: { value: '30.00' } });
      fireEvent.change(screen.getByTestId('item-quantity-0'), { target: { value: '1' } });

      const submitBtn = screen.getByTestId('submit-create-sale-btn');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(salesApi.createSale).toHaveBeenCalledTimes(1);
      });

      expect(salesApi.createSale).toHaveBeenCalledWith(
        expect.objectContaining({
          currency: 'USD',
          clientId: 'cli_123',
          items: expect.arrayContaining([
            expect.objectContaining({
              description: 'Whey Protein',
              unitPrice: 30,
              unitPriceAmount: 30,
              quantity: 1,
            }),
          ]),
        }),
        expect.stringMatching(/^sale_init_/),
      );

      // Successfully navigates to the returned Sale ID
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(`/sales/${mockCreatedSale.id}`);
      });
    });

    it('submits with upstream source reference when selected', async () => {
      (salesApi.createSale as jest.Mock).mockResolvedValue(mockCreatedSale);

      renderWithProviders(<SaleCreatePage />, {
        queryClient,
        initialRoute: '/sales/new',
        initialSessionOverride: mockStaffUser,
      });

      // Switch to Source Reference
      fireEvent.click(screen.getByTestId('origin-source-radio'));

      fireEvent.change(screen.getByTestId('source-reference-id-input'), {
        target: { value: 'sess_999' },
      });
      fireEvent.change(screen.getByTestId('source-reference-code-input'), {
        target: { value: 'KINESIO-01' },
      });
      fireEvent.change(screen.getByTestId('item-desc-0'), {
        target: { value: 'Kinesiology Consultation' },
      });
      fireEvent.change(screen.getByTestId('item-price-0'), { target: { value: '85.00' } });

      const submitBtn = screen.getByTestId('submit-create-sale-btn');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(salesApi.createSale).toHaveBeenCalledWith(
          expect.objectContaining({
            sourceReference: {
              type: 'INVENTORY_ITEM',
              referenceId: 'sess_999',
              referenceCode: 'KINESIO-01',
            },
          }),
          expect.any(String),
        );
      });
    });

    it('disables submit button and add-item button while creation request is in-flight', async () => {
      let resolvePromise: (value: SaleDTO) => void = () => {};
      const pendingPromise = new Promise<SaleDTO>((resolve) => {
        resolvePromise = resolve;
      });
      (salesApi.createSale as jest.Mock).mockReturnValue(pendingPromise);

      renderWithProviders(<SaleCreatePage />, {
        queryClient,
        initialRoute: '/sales/new',
        initialSessionOverride: mockStaffUser,
      });

      fireEvent.change(screen.getByTestId('item-desc-0'), {
        target: { value: 'Whey Protein' },
      });
      fireEvent.change(screen.getByTestId('item-price-0'), { target: { value: '30.00' } });

      const submitBtn = screen.getByTestId('submit-create-sale-btn');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(submitBtn).toBeDisabled();
      });
      expect(screen.getByTestId('add-line-item-btn')).toBeDisabled();
      expect(screen.getByText('Initializing Draft Sale...')).toBeInTheDocument();

      resolvePromise(mockCreatedSale);
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(`/sales/${mockCreatedSale.id}`);
      });
    });
  });

  describe('5. Error Handling & Duplicate-Source Conflicts', () => {
    it('handles 409 Conflict duplicate sale error and renders conflict alert while preserving form input', async () => {
      const conflictError = {
        status: 409,
        statusCode: 409,
        message:
          "An active Sale ('sale_01j999') already exists for TreatmentSession 'sess_999'. Duplicate sale creation is prohibited.",
      };
      (salesApi.createSale as jest.Mock).mockRejectedValue(conflictError);

      renderWithProviders(<SaleCreatePage />, {
        queryClient,
        initialRoute: '/sales/new',
        initialSessionOverride: mockStaffUser,
      });

      fireEvent.change(screen.getByTestId('item-desc-0'), {
        target: { value: 'Rehab Treatment' },
      });
      fireEvent.change(screen.getByTestId('item-price-0'), { target: { value: '120.00' } });

      const submitBtn = screen.getByTestId('submit-create-sale-btn');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByTestId('sale-create-error')).toBeInTheDocument();
      });

      expect(screen.getByText(/Duplicate Sale Transaction Detected/i)).toBeInTheDocument();
      expect(screen.getByText(/prohibits creating duplicate sales/i)).toBeInTheDocument();

      // Form input is preserved
      expect(screen.getByTestId('item-desc-0')).toHaveValue('Rehab Treatment');
      expect(screen.getByTestId('item-price-0')).toHaveValue(120);

      // Did not navigate
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('handles backend 400 validation error and preserves user input', async () => {
      const validationError = {
        status: 400,
        message: "Invalid ISO-4217 currency code 'XXX'.",
      };
      (salesApi.createSale as jest.Mock).mockRejectedValue(validationError);

      renderWithProviders(<SaleCreatePage />, {
        queryClient,
        initialRoute: '/sales/new',
        initialSessionOverride: mockStaffUser,
      });

      fireEvent.change(screen.getByTestId('item-desc-0'), { target: { value: 'Custom Service' } });
      fireEvent.change(screen.getByTestId('item-price-0'), { target: { value: '50.00' } });

      const submitBtn = screen.getByTestId('submit-create-sale-btn');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByTestId('sale-create-error')).toBeInTheDocument();
      });

      expect(
        within(screen.getByTestId('sale-create-error')).getByText(
          /Invalid ISO-4217 currency code 'XXX'/i,
        ),
      ).toBeInTheDocument();
      expect(screen.getByTestId('item-desc-0')).toHaveValue('Custom Service');
    });
  });

  describe('6. Permission Enforcement', () => {
    it('blocks access with accessible 403 ForbiddenView when user lacks sales.create permission', () => {
      renderWithProviders(<SaleCreatePage />, {
        queryClient,
        initialRoute: '/sales/new',
        initialSessionOverride: mockReadOnlyUser,
      });

      // Form should not be rendered
      expect(screen.queryByTestId('sale-create-page')).not.toBeInTheDocument();

      // Forbidden view is rendered
      expect(screen.getByText(/403 — Access Denied/i)).toBeInTheDocument();
      expect(screen.getByText(/Missing required permission 'sales.create'/i)).toBeInTheDocument();
    });
  });
});
