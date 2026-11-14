import '@testing-library/jest-dom';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { SaleCreatePage } from '../pages/sale-create-page';
import { salesApi } from '../api';
import { membershipsApi } from '../../gym/memberships/api/memberships-api';
import { clientApi } from '../../client/api/client-api';
import { usePlans } from '../../gym/plans/hooks/use-plans';
import { useClientTreatmentHistory } from '../../kinesiology/hooks/use-client-treatment-history';
import { useInventoryList } from '../../resources/inventory/hooks/use-inventory-queries';
import { useRoomsList } from '../../scheduling/hooks/use-scheduling-queries';
import { renderWithProviders } from '../../../test/test-utils';
import type { AuthUser } from '../../auth/domain/auth-state.types';
import type { SaleDTO } from '../types/sales.types';
import { InventoryCategory } from '../../resources/inventory/types/inventory.types';

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
    finalizeSale: jest.fn(),
    recordPayment: jest.fn(),
    issueReceipt: jest.fn(),
  },
}));

jest.mock('../../gym/memberships/api/memberships-api', () => ({
  membershipsApi: {
    listMemberships: jest.fn(),
    createMembership: jest.fn(),
  },
}));

jest.mock('../../client/api/client-api', () => ({
  clientApi: {
    searchClients: jest.fn(),
    getClientProfile: jest.fn(),
  },
}));

jest.mock('../../gym/plans/hooks/use-plans', () => ({
  usePlans: jest.fn(),
}));

jest.mock('../../kinesiology/hooks/use-client-treatment-history', () => ({
  useClientTreatmentHistory: jest.fn(),
}));

jest.mock('../../resources/inventory/hooks/use-inventory-queries', () => ({
  useInventoryList: jest.fn(),
}));

jest.mock('../../scheduling/hooks/use-scheduling-queries', () => ({
  useRoomsList: jest.fn(),
}));

const mockCashierUser: AuthUser = {
  id: 'usr_cashier_1',
  email: 'cashier@kinergy.test',
  name: 'Front Desk Cashier',
  roles: ['Receptionist'],
  permissions: ['sales.read', 'sales.create', 'inventory.read'],
  tenantId: 'tenant_1',
};

const mockPlansData = {
  items: [
    {
      id: 'plan_monthly_pro',
      code: 'GYM-M-PRO',
      name: 'Monthly Pro Pass',
      description: 'Full gym access with classes',
      durationInDays: 30,
      priceAmount: 65.0,
      priceCurrency: 'USD',
      status: 'ACTIVE',
      visitQuota: null,
    },
    {
      id: 'plan_punch_10',
      code: 'GYM-PUNCH-10',
      name: '10-Visit Punch Card',
      description: 'Ten individual visits',
      durationInDays: 90,
      priceAmount: 45.0,
      priceCurrency: 'USD',
      status: 'ACTIVE',
      visitQuota: 10,
    },
  ],
  total: 2,
};

const mockInventoryData = {
  items: [
    {
      id: 'inv_protein_shake',
      sku: 'BEV-SHAKE-01',
      name: 'Whey Protein Shake 500ml',
      category: InventoryCategory.HEALTHY_DRINKS,
      sellingPrice: { amount: 6.5, currency: 'USD' },
      costPrice: { amount: 3.0, currency: 'USD' },
      currentStock: 25,
      minStockAlert: 5,
      isOutOfStock: false,
      status: 'ACTIVE',
    },
    {
      id: 'inv_chicken_salad',
      sku: 'FOOD-SALAD-01',
      name: 'Grilled Chicken Caesar Bowl',
      category: InventoryCategory.HEALTHY_MEALS,
      sellingPrice: { amount: 12.0, currency: 'USD' },
      costPrice: { amount: 5.5, currency: 'USD' },
      currentStock: 10,
      minStockAlert: 2,
      isOutOfStock: false,
      status: 'ACTIVE',
    },
    {
      id: 'inv_out_of_stock_item',
      sku: 'FOOD-SOUP-01',
      name: 'Organic Lentil Soup',
      category: InventoryCategory.HEALTHY_MEALS,
      sellingPrice: { amount: 8.0, currency: 'USD' },
      costPrice: { amount: 3.5, currency: 'USD' },
      currentStock: 0,
      minStockAlert: 2,
      isOutOfStock: true,
      status: 'ACTIVE',
    },
    {
      id: 'inv_unpriced_snack',
      sku: 'FOOD-SNK-01',
      name: 'Unpriced Protein Bar',
      category: InventoryCategory.HEALTHY_MEALS,
      sellingPrice: { amount: 0, currency: 'USD' },
      costPrice: { amount: 1.0, currency: 'USD' },
      currentStock: 20,
      minStockAlert: 5,
      isOutOfStock: false,
      status: 'ACTIVE',
    },
  ],
  total: 4,
};

const mockRoomsData = [
  {
    id: 'room_rehab_1',
    name: 'Rehab Studio A',
    status: 'AVAILABLE',
    capacity: 4,
  },
];

const mockTreatmentHistoryData = {
  items: [
    {
      sessionId: 'sess_treatment_999',
      appointmentId: 'apt_123',
      clientId: 'cli_seed_carlos',
      therapistId: 'Dr. Valeria Gomez',
      status: 'COMPLETED',
      createdAt: '2026-11-05T14:00:00.000Z',
    },
  ],
  total: 1,
};

describe('POS Station Experience (/sales/new)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });
    jest.clearAllMocks();

    (usePlans as jest.Mock).mockReturnValue({
      data: mockPlansData,
      isLoading: false,
      error: null,
    });

    (useClientTreatmentHistory as jest.Mock).mockReturnValue({
      data: mockTreatmentHistoryData,
      isLoading: false,
      error: null,
    });

    (useInventoryList as jest.Mock).mockReturnValue({
      data: mockInventoryData,
      isLoading: false,
      error: null,
    });

    (useRoomsList as jest.Mock).mockReturnValue({
      data: mockRoomsData,
      isLoading: false,
      error: null,
    });

    (clientApi.searchClients as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 'cli_seed_carlos',
          referenceNumber: 'CLI-2026-00003',
          firstName: 'Carlos',
          lastName: 'Rivera',
          fullName: 'Carlos Rivera',
          email: 'carlos.rivera@example.com',
          phone: '+591 71234567',
          status: 'ACTIVE',
        },
      ],
      meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
    });

    (membershipsApi.listMemberships as jest.Mock).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
    });
    (membershipsApi.createMembership as jest.Mock).mockResolvedValue({
      id: 'mem_auto_created_01',
      clientId: 'cli_seed_carlos',
      planId: 'plan_monthly_pro',
      status: 'ACTIVE',
    });
  });

  const renderPOS = (userOverride?: AuthUser) => {
    return renderWithProviders(<SaleCreatePage />, {
      queryClient,
      initialSessionOverride: userOverride ?? mockCashierUser,
    });
  };

  describe('1. POS Station Layout & Customer Modes', () => {
    it('renders the POS station header and customer selection by default', () => {
      renderPOS();

      expect(screen.getByText('Point of Sale (POS) Station')).toBeInTheDocument();
      expect(screen.getByTestId('pos-client-selector')).toBeInTheDocument();
      expect(screen.getByTestId('pos-category-selector')).toBeInTheDocument();
      expect(screen.getByTestId('pos-item-browser')).toBeInTheDocument();
      expect(screen.getByTestId('pos-cart')).toBeInTheDocument();
      expect(screen.getByTestId('pos-payment-panel')).toBeInTheDocument();
    });

    it('allows toggling between Registered Client search and Walk-in Guest mode', () => {
      renderPOS();

      // Initially Registered Client mode is active with search input
      expect(screen.getByTestId('pos-mode-client-btn')).toBeInTheDocument();
      expect(screen.getByTestId('client-search-input')).toBeInTheDocument();

      // Toggle to Walk-in Guest mode
      const walkInBtn = screen.getByTestId('pos-mode-walkin-btn');
      fireEvent.click(walkInBtn);

      expect(screen.getByText('Anonymous Walk-in Customer')).toBeInTheDocument();

      // Toggle back to Registered Client mode
      const clientBtn = screen.getByTestId('pos-mode-client-btn');
      fireEvent.click(clientBtn);

      expect(screen.getByTestId('client-search-input')).toBeInTheDocument();
    });

    it('allows toggling between POS Station and Manual Order Form', () => {
      renderPOS();

      const switchToManualBtn = screen.getByTestId('switch-to-manual-view-btn');
      expect(switchToManualBtn).toBeInTheDocument();

      fireEvent.click(switchToManualBtn);

      // Manual order form heading is displayed
      expect(screen.getByText('Create Commercial Sale')).toBeInTheDocument();

      const switchToPosBtn = screen.getByTestId('switch-to-pos-view-btn');
      fireEvent.click(switchToPosBtn);

      expect(screen.getByText('Point of Sale (POS) Station')).toBeInTheDocument();
    });
  });

  describe('2. Category Selection & Catalog Browsing', () => {
    it('displays all 5 commercial categories and highlights the active one', () => {
      renderPOS();

      expect(screen.getByTestId('pos-category-tab-gym_membership')).toBeInTheDocument();
      expect(screen.getByTestId('pos-category-tab-kinesiology')).toBeInTheDocument();
      expect(screen.getByTestId('pos-category-tab-food')).toBeInTheDocument();
      expect(screen.getByTestId('pos-category-tab-drinks_products')).toBeInTheDocument();
      expect(screen.getByTestId('pos-category-tab-room_rental')).toBeInTheDocument();
    });

    it('switches between categories and renders corresponding items', () => {
      renderPOS();

      // Gym Membership is default
      expect(screen.getByTestId('pos-browser-gym')).toBeInTheDocument();
      expect(screen.getByText('Monthly Pro Pass')).toBeInTheDocument();

      // Switch to Food
      fireEvent.click(screen.getByTestId('pos-category-tab-food'));
      expect(screen.getByTestId('pos-browser-food')).toBeInTheDocument();
      expect(screen.getByText('Grilled Chicken Caesar Bowl')).toBeInTheDocument();

      // Switch to Drinks & Products
      fireEvent.click(screen.getByTestId('pos-category-tab-drinks_products'));
      expect(screen.getByTestId('pos-browser-drinks')).toBeInTheDocument();
      expect(screen.getByText('Whey Protein Shake 500ml')).toBeInTheDocument();

      // Switch to Room Rentals
      fireEvent.click(screen.getByTestId('pos-category-tab-room_rental'));
      expect(screen.getByTestId('pos-browser-rooms')).toBeInTheDocument();
      expect(screen.getByText('Rehab Studio A')).toBeInTheDocument();
    });
  });

  describe('3. Adding Items to Cart & Stock Validation', () => {
    it('adds a gym membership plan to the cart with correct integer cents', () => {
      renderPOS();

      const addPlanBtn = screen.getByTestId('add-plan-btn-plan_monthly_pro');
      fireEvent.click(addPlanBtn);

      // Cart should now contain the item
      expect(
        screen.getByTestId('pos-cart-item-MEMBERSHIP_PLAN-plan_monthly_pro'),
      ).toBeInTheDocument();
      expect(screen.getByText('Gym Membership - Monthly Pro Pass')).toBeInTheDocument();
      expect(screen.getByTestId('pos-subtotal')).toHaveTextContent(/65\.00/);
      expect(screen.getByTestId('pos-net-total')).toHaveTextContent(/65\.00/);
    });

    it('prevents adding out-of-stock food items', () => {
      renderPOS();

      // Switch to Food category
      fireEvent.click(screen.getByTestId('pos-category-tab-food'));

      const outOfStockBtn = screen.getByTestId('add-food-btn-inv_out_of_stock_item');
      expect(outOfStockBtn).toBeDisabled();
      expect(outOfStockBtn).toHaveTextContent('Out of Stock');
    });

    it('requires a registered client for billing kinesiology sessions', () => {
      renderPOS();

      // Toggle to Walk-in mode first
      fireEvent.click(screen.getByTestId('pos-mode-walkin-btn'));

      // Switch to Kinesiology while in walk-in mode
      fireEvent.click(screen.getByTestId('pos-category-tab-kinesiology'));

      expect(screen.getByText('Walk-in Guests Cannot Bill Clinical Sessions')).toBeInTheDocument();
      expect(screen.queryByTestId('pos-session-card-sess_treatment_999')).not.toBeInTheDocument();
    });

    it('allows configuring room rental hours before adding to cart', () => {
      renderPOS();

      // Switch to Room Rental
      fireEvent.click(screen.getByTestId('pos-category-tab-room_rental'));

      const hoursSelect = screen.getByTestId('room-hours-select-room_rehab_1');
      fireEvent.change(hoursSelect, { target: { value: '2' } });

      const addRoomBtn = screen.getByTestId('add-room-btn-room_rehab_1');
      fireEvent.click(addRoomBtn);

      // 2 hours at $60/hr = $120.00
      expect(screen.getByTestId('pos-subtotal')).toHaveTextContent(/120\.00/);
      expect(screen.getByTestId('pos-net-total')).toHaveTextContent(/120\.00/);
    });
  });

  describe('4. Cart Management, Integer Math & Order Discounts', () => {
    it('increments, decrements, and removes cart items correctly', () => {
      renderPOS();

      // Add a gym membership plan ($65.00)
      fireEvent.click(screen.getByTestId('add-plan-btn-plan_monthly_pro'));

      const qtySpan = screen.getByTestId('pos-qty-display-plan_monthly_pro');
      expect(qtySpan).toHaveTextContent('1');

      // Increment
      const incBtn = screen.getByTestId('pos-increase-qty-plan_monthly_pro');
      fireEvent.click(incBtn);
      expect(qtySpan).toHaveTextContent('2');
      expect(screen.getByTestId('pos-subtotal')).toHaveTextContent(/130\.00/);

      // Decrement
      const decBtn = screen.getByTestId('pos-decrease-qty-plan_monthly_pro');
      fireEvent.click(decBtn);
      expect(qtySpan).toHaveTextContent('1');
      expect(screen.getByTestId('pos-subtotal')).toHaveTextContent(/65\.00/);

      // Remove
      const removeBtn = screen.getByTestId('pos-remove-cart-item-plan_monthly_pro');
      fireEvent.click(removeBtn);
      expect(
        screen.queryByTestId('pos-cart-item-MEMBERSHIP_PLAN-plan_monthly_pro'),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId('pos-empty-cart')).toBeInTheDocument();
    });

    it('applies percentage discount with accurate integer rounding', () => {
      renderPOS();

      // Add a plan ($65.00)
      fireEvent.click(screen.getByTestId('add-plan-btn-plan_monthly_pro'));

      // Open discount selector
      fireEvent.click(screen.getByTestId('pos-add-discount-btn'));

      // Apply 10% discount
      const discountInput = screen.getByTestId('pos-discount-value-input');
      fireEvent.change(discountInput, { target: { value: '10' } });

      const applyBtn = screen.getByTestId('pos-apply-discount-btn');
      fireEvent.click(applyBtn);

      // Subtotal: $65.00, 10% = $6.50 discount, Net: $58.50
      expect(screen.getByTestId('pos-discount')).toHaveTextContent(/6\.50/);
      expect(screen.getByTestId('pos-net-total')).toHaveTextContent(/58\.50/);
    });

    it('clears all cart items on Clear Cart action', () => {
      renderPOS();

      fireEvent.click(screen.getByTestId('add-plan-btn-plan_monthly_pro'));
      expect(screen.getByTestId('pos-clear-cart-btn')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('pos-clear-cart-btn'));
      expect(screen.getByTestId('pos-empty-cart')).toBeInTheDocument();
    });
  });

  describe('5. Checkout Orchestration & Post-Sale Confirmation', () => {
    const mockCreatedSaleDTO: SaleDTO = {
      id: 'sale_pos_uuid_001',
      tenantId: 'tenant_1',
      clientId: null,
      currency: 'USD',
      status: 'DRAFT',
      sourceReference: {
        type: 'GYM_MEMBERSHIP',
        referenceId: 'plan_monthly_pro',
        referenceCode: 'GYM-M-PRO',
      },
      subtotal: { amount: 65.0, currency: 'USD', formatted: '$65.00' },
      discountTotal: { amount: 0, currency: 'USD', formatted: '$0.00' },
      total: { amount: 65.0, currency: 'USD', formatted: '$65.00' },
      subtotalAmount: 65.0,
      discountTotalAmount: 0,
      totalAmount: 65.0,
      itemCount: 1,
      items: [],
      version: 1,
      createdAt: '2026-11-06T12:00:00.000Z',
      updatedAt: '2026-11-06T12:00:00.000Z',
      completedAt: null,
      cancelledAt: null,
      cancellationReason: null,
      refundedAt: null,
    };

    it('orchestrates 4-step CASH checkout without sending sensitive card PAN timestamps', async () => {
      (salesApi.createSale as jest.Mock).mockResolvedValue(mockCreatedSaleDTO);
      (salesApi.finalizeSale as jest.Mock).mockResolvedValue({
        ...mockCreatedSaleDTO,
        status: 'PENDING_PAYMENT',
      });
      (salesApi.recordPayment as jest.Mock).mockResolvedValue({
        id: 'pay_001',
        saleId: 'sale_pos_uuid_001',
        amount: { amount: 65.0, currency: 'USD' },
        method: 'CASH',
        status: 'COMPLETED',
      });
      (salesApi.issueReceipt as jest.Mock).mockResolvedValue({
        id: 'rcpt_001',
        receiptNumber: 'RCPT-2026-0001',
        saleId: 'sale_pos_uuid_001',
        issuedAt: '2026-11-06T12:00:05.000Z',
      });

      renderPOS();

      // Add a plan ($65.00)
      fireEvent.click(screen.getByTestId('add-plan-btn-plan_monthly_pro'));

      // In payment panel, CASH is active
      expect(screen.getByTestId('pos-pay-cash-btn')).toBeInTheDocument();

      // Enter Tender Amount: $100.00 (change should be $35.00)
      const tenderInput = screen.getByTestId('pos-tender-input');
      fireEvent.change(tenderInput, { target: { value: '100' } });

      expect(screen.getByTestId('pos-change-display')).toHaveTextContent(/35\.00/);

      // Click complete cash sale
      const checkoutBtn = screen.getByTestId('pos-complete-sale-btn');
      fireEvent.click(checkoutBtn);

      // Verify all 4 orchestration calls were executed in proper order and reference is undefined (not Date.now())
      await waitFor(() => {
        expect(salesApi.createSale).toHaveBeenCalledTimes(1);
        expect(salesApi.finalizeSale).toHaveBeenCalledWith('sale_pos_uuid_001');
        expect(salesApi.recordPayment).toHaveBeenCalledWith(
          'sale_pos_uuid_001',
          expect.objectContaining({
            method: 'CASH',
            status: 'COMPLETED',
            amount: 65.0,
            reference: undefined,
          }),
        );
        expect(salesApi.issueReceipt).toHaveBeenCalledWith('sale_pos_uuid_001');
      });

      // Verify Confirmation Voucher screen is displayed
      await waitFor(() => {
        expect(screen.getByTestId('pos-confirmation-view')).toBeInTheDocument();
        expect(screen.getByText('Sale Completed Successfully')).toBeInTheDocument();
        expect(screen.getByText('Change Given: $35.00')).toBeInTheDocument();
      });

      // Click "Start Next Sale" button to reset station
      const nextSaleBtn = screen.getByTestId('pos-new-sale-btn');
      fireEvent.click(nextSaleBtn);

      // Returns to clean POS station ready for next client
      expect(screen.getByTestId('pos-item-browser')).toBeInTheDocument();
      expect(screen.getByTestId('pos-empty-cart')).toBeInTheDocument();
    });

    it('skips duplicate finalization when sale is already in PENDING_PAYMENT status', async () => {
      (salesApi.createSale as jest.Mock).mockResolvedValue({
        ...mockCreatedSaleDTO,
        status: 'PENDING_PAYMENT',
      });
      (salesApi.recordPayment as jest.Mock).mockResolvedValue({
        id: 'pay_002',
        saleId: 'sale_pos_uuid_001',
        amount: { amount: 65.0, currency: 'USD' },
        method: 'CASH',
        status: 'COMPLETED',
      });
      (salesApi.issueReceipt as jest.Mock).mockResolvedValue({
        id: 'rcpt_002',
        receiptNumber: 'RCPT-2026-0002',
        saleId: 'sale_pos_uuid_001',
        issuedAt: '2026-11-06T12:00:05.000Z',
      });

      renderPOS();

      fireEvent.click(screen.getByTestId('add-plan-btn-plan_monthly_pro'));
      fireEvent.click(screen.getByTestId('pos-complete-sale-btn'));

      await waitFor(() => {
        expect(salesApi.createSale).toHaveBeenCalledTimes(1);
        // Should NOT call finalizeSale because it was already PENDING_PAYMENT
        expect(salesApi.finalizeSale).not.toHaveBeenCalled();
        expect(salesApi.recordPayment).toHaveBeenCalledTimes(1);
      });
    });

    it('orchestrates QR tender payment in PENDING status without immediate receipt', async () => {
      (salesApi.createSale as jest.Mock).mockResolvedValue(mockCreatedSaleDTO);
      (salesApi.finalizeSale as jest.Mock).mockResolvedValue({
        ...mockCreatedSaleDTO,
        status: 'PENDING_PAYMENT',
      });
      (salesApi.recordPayment as jest.Mock).mockResolvedValue({
        id: 'pay_qr_002',
        saleId: 'sale_pos_uuid_001',
        amount: { amount: 65.0, currency: 'USD' },
        method: 'QR',
        status: 'PENDING',
      });

      renderPOS();

      // Add a plan ($65.00)
      fireEvent.click(screen.getByTestId('add-plan-btn-plan_monthly_pro'));

      // Switch to QR payment method
      fireEvent.click(screen.getByTestId('pos-pay-qr-btn'));

      const qrRefInput = screen.getByTestId('pos-qr-ref-input');
      fireEvent.change(qrRefInput, { target: { value: 'QR-TX-9988' } });

      const checkoutBtn = screen.getByTestId('pos-complete-sale-btn');
      fireEvent.click(checkoutBtn);

      await waitFor(() => {
        expect(salesApi.recordPayment).toHaveBeenCalledWith(
          'sale_pos_uuid_001',
          expect.objectContaining({
            method: 'QR',
            status: 'PENDING',
            reference: 'QR-TX-9988',
          }),
        );
        // QR does not auto-issue receipt until payment confirmation is completed
        expect(salesApi.issueReceipt).not.toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(screen.getByTestId('pos-confirmation-view')).toBeInTheDocument();
        expect(screen.getByText('Sale Completed Successfully')).toBeInTheDocument();
      });
    });

    it('allows saving transaction as draft without immediate payment tender', async () => {
      (salesApi.createSale as jest.Mock).mockResolvedValue(mockCreatedSaleDTO);

      renderPOS();

      // Add a plan
      fireEvent.click(screen.getByTestId('add-plan-btn-plan_monthly_pro'));

      // Click "Save as Draft Order" in payment panel
      const saveDraftBtn = screen.getByTestId('pos-save-draft-btn');
      fireEvent.click(saveDraftBtn);

      await waitFor(() => {
        expect(salesApi.createSale).toHaveBeenCalledWith(
          expect.objectContaining({
            sourceReference: {
              type: 'GYM_MEMBERSHIP',
              referenceId: 'plan_monthly_pro',
              referenceCode: undefined,
            },
          }),
          expect.any(String),
        );
        expect(salesApi.finalizeSale).not.toHaveBeenCalled();
        expect(salesApi.recordPayment).not.toHaveBeenCalled();
        expect(salesApi.issueReceipt).not.toHaveBeenCalled();
        expect(membershipsApi.createMembership).not.toHaveBeenCalled();
        expect(mockNavigate).toHaveBeenCalledWith('/sales/sale_pos_uuid_001');
      });
    });

    it('links or initializes membership agreement when completing sale for gym membership', async () => {
      (salesApi.createSale as jest.Mock).mockResolvedValue(mockCreatedSaleDTO);
      (salesApi.finalizeSale as jest.Mock).mockResolvedValue({
        ...mockCreatedSaleDTO,
        status: 'FINALIZED',
      });
      (salesApi.recordPayment as jest.Mock).mockResolvedValue({
        id: 'pay_cash_mem_001',
        saleId: 'sale_pos_uuid_001',
        amount: { amount: 65.0, currency: 'USD' },
        method: 'CASH',
        status: 'COMPLETED',
      });
      (salesApi.issueReceipt as jest.Mock).mockResolvedValue({
        id: 'rec_cash_mem_001',
        saleId: 'sale_pos_uuid_001',
        receiptNumber: 'REC-2026-00099',
        issuedAt: new Date().toISOString(),
      });

      renderPOS();

      // Select client via selector
      const clientInput = screen.getByTestId('input-client-id');
      fireEvent.change(clientInput, { target: { value: 'cli_seed_carlos' } });

      // Add Monthly Pro Membership
      fireEvent.click(screen.getByTestId('add-plan-btn-plan_monthly_pro'));

      // Complete sale with CASH
      const checkoutBtn = screen.getByTestId('pos-complete-sale-btn');
      fireEvent.click(checkoutBtn);

      await waitFor(() => {
        // Membership agreement should be initialized via membershipsApi.createMembership
        expect(membershipsApi.createMembership).toHaveBeenCalledWith(
          expect.objectContaining({
            clientId: 'cli_seed_carlos',
            planId: 'plan_monthly_pro',
          }),
        );

        // createSale should receive sourceReference for gym membership
        expect(salesApi.createSale).toHaveBeenCalledWith(
          expect.objectContaining({
            clientId: 'cli_seed_carlos',
            sourceReference: {
              type: 'GYM_MEMBERSHIP',
              referenceId: 'plan_monthly_pro',
              referenceCode: undefined,
            },
            items: expect.arrayContaining([
              expect.objectContaining({
                sourceType: 'MEMBERSHIP_PLAN',
                sourceId: 'plan_monthly_pro',
              }),
            ]),
          }),
          expect.any(String),
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('pos-confirmation-view')).toBeInTheDocument();
        expect(screen.getByText('Sale Completed Successfully')).toBeInTheDocument();
        expect(screen.getByTestId('pos-view-receipt-btn')).toBeInTheDocument();
        expect(screen.getByTestId('pos-view-receipt-btn')).toHaveAttribute(
          'href',
          '/sales/sale_pos_uuid_001/receipt',
        );
      });
    });

    it('enables Receptionist holding inventory.read to sell Food with CASH tender', async () => {
      (salesApi.createSale as jest.Mock).mockResolvedValue(mockCreatedSaleDTO);
      (salesApi.finalizeSale as jest.Mock).mockResolvedValue({
        ...mockCreatedSaleDTO,
        status: 'PENDING_PAYMENT',
      });
      (salesApi.recordPayment as jest.Mock).mockResolvedValue({
        id: 'pay_pos_food_001',
        saleId: 'sale_pos_uuid_001',
        amount: 12.0,
        currency: 'USD',
        status: 'COMPLETED',
        method: 'CASH',
      });
      (salesApi.issueReceipt as jest.Mock).mockResolvedValue({
        id: 'rec_food_001',
        receiptNumber: 'REC-2026-00088',
        saleId: 'sale_pos_uuid_001',
        pdfUrl: 'http://localhost:3000/api/v1/receipts/rec_food_001/pdf',
      });

      renderPOS();

      // Switch to Food & Meals
      fireEvent.click(screen.getByTestId('pos-category-tab-food'));

      // Add Grilled Chicken Caesar Bowl ($12.00)
      const addFoodBtn = screen.getByTestId('add-food-btn-inv_chicken_salad');
      fireEvent.click(addFoodBtn);

      expect(screen.getByTestId('pos-net-total')).toHaveTextContent(/12\.00/);

      // Select CASH Tender
      fireEvent.click(screen.getByTestId('pos-pay-cash-btn'));

      // Enter Tendered Amount $15.00
      const tenderInput = screen.getByTestId('pos-tender-input');
      fireEvent.change(tenderInput, { target: { value: '15.00' } });

      // Change due: $3.00
      expect(screen.getByTestId('pos-change-display')).toHaveTextContent(/3\.00/);

      // Complete Sale
      fireEvent.click(screen.getByTestId('pos-complete-sale-btn'));

      await waitFor(() => {
        expect(salesApi.createSale).toHaveBeenCalledWith(
          expect.objectContaining({
            sourceReference: {
              type: 'FOOD',
              referenceId: 'inv_chicken_salad',
              referenceCode: 'FOOD-SALAD-01',
            },
            items: expect.arrayContaining([
              expect.objectContaining({
                sourceType: 'INVENTORY_ITEM',
                sourceId: 'inv_chicken_salad',
              }),
            ]),
          }),
          expect.any(String),
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('pos-confirmation-view')).toBeInTheDocument();
      });
    });

    it('enables Receptionist holding inventory.read to sell Drinks with QR tender', async () => {
      (salesApi.createSale as jest.Mock).mockResolvedValue(mockCreatedSaleDTO);
      (salesApi.finalizeSale as jest.Mock).mockResolvedValue({
        ...mockCreatedSaleDTO,
        status: 'PENDING_PAYMENT',
      });
      (salesApi.recordPayment as jest.Mock).mockResolvedValue({
        id: 'pay_pos_drink_001',
        saleId: 'sale_pos_uuid_001',
        amount: 6.5,
        currency: 'USD',
        status: 'PENDING',
        method: 'QR',
      });

      renderPOS();

      // Switch to Drinks & Products
      fireEvent.click(screen.getByTestId('pos-category-tab-drinks_products'));

      // Add Whey Protein Shake ($6.50)
      const addDrinkBtn = screen.getByTestId('add-drink-btn-inv_protein_shake');
      fireEvent.click(addDrinkBtn);

      expect(screen.getByTestId('pos-net-total')).toHaveTextContent(/6\.50/);

      // Select QR Tender
      fireEvent.click(screen.getByTestId('pos-pay-qr-btn'));

      // Complete Sale
      fireEvent.click(screen.getByTestId('pos-complete-sale-btn'));

      await waitFor(() => {
        expect(salesApi.createSale).toHaveBeenCalledWith(
          expect.objectContaining({
            sourceReference: {
              type: 'DRINK',
              referenceId: 'inv_protein_shake',
              referenceCode: 'BEV-SHAKE-01',
            },
            items: expect.arrayContaining([
              expect.objectContaining({
                sourceType: 'INVENTORY_ITEM',
                sourceId: 'inv_protein_shake',
              }),
            ]),
          }),
          expect.any(String),
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId('pos-confirmation-view')).toBeInTheDocument();
      });
    });

    it('displays permission alert when user lacks inventory.read for food/drinks', () => {
      const unprivilegedUser: AuthUser = {
        ...mockCashierUser,
        permissions: ['sales.read', 'sales.create'], // lacks inventory.read
      };

      renderPOS(unprivilegedUser);

      // Switch to Food
      fireEvent.click(screen.getByTestId('pos-category-tab-food'));
      expect(screen.getByTestId('pos-food-permission-notice')).toBeInTheDocument();
      expect(screen.getByTestId('pos-food-permission-notice')).toHaveTextContent(/inventory\.read/);

      // Switch to Drinks
      fireEvent.click(screen.getByTestId('pos-category-tab-drinks_products'));
      expect(screen.getByTestId('pos-drinks-permission-notice')).toBeInTheDocument();
      expect(screen.getByTestId('pos-drinks-permission-notice')).toHaveTextContent(
        /inventory\.read/,
      );
    });

    it('disables add to cart and alerts user when a food item lacks a valid selling price', () => {
      renderPOS();

      fireEvent.click(screen.getByTestId('pos-category-tab-food'));

      expect(screen.getByTestId('pos-food-card-inv_unpriced_snack')).toBeInTheDocument();
      expect(screen.getByTestId('pos-food-card-inv_unpriced_snack')).toHaveTextContent(
        'This product does not have a valid selling price configured. Please contact an administrator.',
      );
      expect(screen.getByTestId('add-food-btn-inv_unpriced_snack')).toBeDisabled();
      expect(screen.getByTestId('add-food-btn-inv_unpriced_snack')).toHaveTextContent('Unpriced');
    });
  });

  describe('6. Repeat Purchase Integrity & Station Reset Lifecycle (Task 84268)', () => {
    const mockSaleTemplate: SaleDTO = {
      id: 'sale_pos_uuid_001',
      tenantId: 'tenant_1',
      clientId: null,
      currency: 'USD',
      status: 'DRAFT',
      sourceReference: {
        type: 'FOOD',
        referenceId: 'inv_chicken_salad',
        referenceCode: 'FOOD-SALAD-01',
      },
      subtotal: { amount: 5.5, currency: 'USD', formatted: '$5.50' },
      discountTotal: { amount: 0, currency: 'USD', formatted: '$0.00' },
      total: { amount: 5.5, currency: 'USD', formatted: '$5.50' },
      subtotalAmount: 5.5,
      discountTotalAmount: 0,
      totalAmount: 5.5,
      itemCount: 1,
      items: [],
      version: 1,
      createdAt: '2026-11-06T12:00:00.000Z',
      updatedAt: '2026-11-06T12:00:00.000Z',
      completedAt: null,
      cancelledAt: null,
      cancellationReason: null,
      refundedAt: null,
    };

    it('completes sale, resets station via Start Next Sale, and purchases the exact same product as an independent transaction', async () => {
      let saleCounter = 1;
      const idempotencyKeysUsed: string[] = [];

      (salesApi.createSale as jest.Mock).mockImplementation((_input, idemKey) => {
        idempotencyKeysUsed.push(idemKey);
        const currentSaleId = `sale_pos_seq_${saleCounter++}`;
        return Promise.resolve({
          ...mockSaleTemplate,
          id: currentSaleId,
          status: 'DRAFT',
          totalAmount: 5.5,
          total: { amount: 5.5, currency: 'USD', formatted: '5.50', cents: 550 },
        });
      });

      (salesApi.finalizeSale as jest.Mock).mockImplementation((saleId) =>
        Promise.resolve({
          ...mockSaleTemplate,
          id: saleId,
          status: 'PENDING_PAYMENT',
        }),
      );

      (salesApi.recordPayment as jest.Mock).mockImplementation((saleId) =>
        Promise.resolve({
          id: `pay_${saleId}`,
          saleId,
          amount: 5.5,
          currency: 'USD',
          status: 'COMPLETED',
          method: 'CASH',
        }),
      );

      (salesApi.issueReceipt as jest.Mock).mockImplementation((saleId) =>
        Promise.resolve({
          id: `rcpt_${saleId}`,
          receiptNumber: `RCPT-${saleId}`,
          saleId,
          issuedAt: new Date().toISOString(),
        }),
      );

      renderPOS();

      // --- Purchase 1: Add Food item and complete sale ---
      fireEvent.click(screen.getByTestId('pos-category-tab-food'));
      fireEvent.click(screen.getByTestId('add-food-btn-inv_chicken_salad'));
      fireEvent.click(screen.getByTestId('pos-pay-cash-btn'));
      fireEvent.click(screen.getByTestId('pos-complete-sale-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('pos-confirmation-view')).toBeInTheDocument();
        expect(screen.getByText('Sale Completed Successfully')).toBeInTheDocument();
      });

      expect(salesApi.createSale).toHaveBeenCalledTimes(1);
      const firstSaleIdSubmitted = (salesApi.finalizeSale as jest.Mock).mock.calls[0][0];
      expect(firstSaleIdSubmitted).toBe('sale_pos_seq_1');

      // --- Click "Start Next Sale" to reset station ---
      fireEvent.click(screen.getByTestId('pos-new-sale-btn'));

      // Verify station is reset: empty cart, item browser visible
      expect(screen.getByTestId('pos-empty-cart')).toBeInTheDocument();
      expect(screen.getByTestId('pos-item-browser')).toBeInTheDocument();

      // --- Purchase 2: Add the exact same product again ---
      fireEvent.click(screen.getByTestId('pos-category-tab-food'));
      fireEvent.click(screen.getByTestId('add-food-btn-inv_chicken_salad'));
      fireEvent.click(screen.getByTestId('pos-pay-cash-btn'));
      fireEvent.click(screen.getByTestId('pos-complete-sale-btn'));

      await waitFor(() => {
        expect(salesApi.createSale).toHaveBeenCalledTimes(2);
      });

      const secondSaleIdSubmitted = (salesApi.finalizeSale as jest.Mock).mock.calls[1][0];
      expect(secondSaleIdSubmitted).toBe('sale_pos_seq_2');
      expect(secondSaleIdSubmitted).not.toBe(firstSaleIdSubmitted);

      // Verify two distinct idempotency keys were generated
      expect(idempotencyKeysUsed).toHaveLength(2);
      expect(idempotencyKeysUsed[0]).not.toBe(idempotencyKeysUsed[1]);

      await waitFor(() => {
        expect(screen.getByTestId('pos-confirmation-view')).toBeInTheDocument();
      });
    });

    it('does not render Keep Customer button and resets selected client when starting next sale', async () => {
      let saleCounter = 10;
      (salesApi.createSale as jest.Mock).mockImplementation(() =>
        Promise.resolve({
          ...mockSaleTemplate,
          id: `sale_reset_client_${saleCounter++}`,
          status: 'DRAFT',
        }),
      );
      (salesApi.finalizeSale as jest.Mock).mockImplementation((saleId) =>
        Promise.resolve({
          ...mockSaleTemplate,
          id: saleId,
          status: 'PENDING_PAYMENT',
        }),
      );
      (salesApi.recordPayment as jest.Mock).mockImplementation((saleId) =>
        Promise.resolve({
          id: `pay_${saleId}`,
          saleId,
          amount: 5.5,
          currency: 'USD',
          status: 'COMPLETED',
          method: 'CASH',
        }),
      );

      renderPOS();

      // 1. Initial sale with registered client Carlos
      const clientInput = screen.getByTestId('input-client-id');
      fireEvent.change(clientInput, { target: { value: 'cli_seed_carlos' } });

      fireEvent.click(screen.getByTestId('pos-category-tab-food'));
      fireEvent.click(screen.getByTestId('add-food-btn-inv_chicken_salad'));
      fireEvent.click(screen.getByTestId('pos-pay-cash-btn'));
      fireEvent.click(screen.getByTestId('pos-complete-sale-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('pos-confirmation-view')).toBeInTheDocument();
      });

      // Verify "Keep Customer" button is completely absent
      expect(screen.queryByTestId('pos-new-sale-same-client-btn')).not.toBeInTheDocument();
      expect(screen.queryByText(/Keep Customer/i)).not.toBeInTheDocument();

      // 2. Click "Start Next Sale" and verify both cart and customer selection are reset
      fireEvent.click(screen.getByTestId('pos-new-sale-btn'));

      expect(screen.getByTestId('pos-empty-cart')).toBeInTheDocument();
      expect(screen.queryByTestId('selected-client-card')).not.toBeInTheDocument();
    });
  });

  describe('7. Receipt Viewing & Persistent Lifecycle (Task 84269)', () => {
    const mockReceiptSaleDTO: SaleDTO = {
      id: 'sale_pos_receipt_001',
      tenantId: 'tenant_kinergy',
      clientId: null,
      currency: 'USD',
      status: 'DRAFT',
      sourceReference: {
        type: 'FOOD',
        referenceId: 'inv_protein_bar',
        referenceCode: 'SKU-SNK-BAR-01',
      },
      subtotal: { amount: 5.5, currency: 'USD', formatted: '$5.50' },
      discountTotal: { amount: 0, currency: 'USD', formatted: '$0.00' },
      total: { amount: 5.5, currency: 'USD', formatted: '$5.50' },
      subtotalAmount: 5.5,
      discountTotalAmount: 0,
      totalAmount: 5.5,
      itemCount: 1,
      items: [],
      version: 1,
      createdAt: '2026-11-06T12:00:00.000Z',
      updatedAt: '2026-11-06T12:00:00.000Z',
      completedAt: null,
      cancelledAt: null,
      cancellationReason: null,
      refundedAt: null,
    };

    it('links View Receipt button directly to sale ID and persists last completed sale banner across station reset', async () => {
      (salesApi.createSale as jest.Mock).mockResolvedValue({
        ...mockReceiptSaleDTO,
        id: 'sale_pos_receipt_001',
      });
      (salesApi.finalizeSale as jest.Mock).mockResolvedValue({
        ...mockReceiptSaleDTO,
        id: 'sale_pos_receipt_001',
        status: 'PENDING_PAYMENT',
      });
      (salesApi.recordPayment as jest.Mock).mockResolvedValue({
        id: 'pay_pos_receipt_001',
        saleId: 'sale_pos_receipt_001',
        amount: 5.5,
        currency: 'USD',
        status: 'COMPLETED',
        method: 'CASH',
      });
      (salesApi.issueReceipt as jest.Mock).mockResolvedValue({
        id: 'rec_pos_receipt_001',
        saleId: 'sale_pos_receipt_001',
        receiptNumber: 'REC-2026-000777',
        issuedAt: new Date().toISOString(),
      });

      renderPOS();

      // Walk-in purchase of Chicken Salad
      fireEvent.click(screen.getByTestId('pos-mode-walkin-btn'));
      fireEvent.click(screen.getByTestId('pos-category-tab-food'));
      fireEvent.click(screen.getByTestId('add-food-btn-inv_chicken_salad'));
      fireEvent.click(screen.getByTestId('pos-pay-cash-btn'));
      fireEvent.click(screen.getByTestId('pos-complete-sale-btn'));

      // 1. Confirmation displays with View Receipt pointing to sale ID (/sales/sale_pos_receipt_001/receipt)
      await waitFor(() => {
        expect(screen.getByTestId('pos-confirmation-view')).toBeInTheDocument();
        const receiptBtn = screen.getByTestId('pos-view-receipt-btn');
        expect(receiptBtn).toBeInTheDocument();
        expect(receiptBtn).toHaveAttribute('href', '/sales/sale_pos_receipt_001/receipt');
      });

      // 2. Click Start Next Sale to reset station
      fireEvent.click(screen.getByTestId('pos-new-sale-btn'));

      // 3. Workstation is active, AND last completed sale banner is visible with receipt link
      await waitFor(() => {
        expect(screen.getByTestId('pos-station-view')).toBeInTheDocument();
        expect(screen.getByTestId('pos-last-completed-sale-banner')).toBeInTheDocument();
        expect(screen.getByTestId('pos-last-completed-sale-banner')).toHaveTextContent(
          /sale_pos_receipt_001/,
        );
        const lastReceiptBtn = screen.getByTestId('pos-view-last-receipt-btn');
        expect(lastReceiptBtn).toBeInTheDocument();
        expect(lastReceiptBtn).toHaveAttribute('href', '/sales/sale_pos_receipt_001/receipt');
      });

      // 4. Dismiss banner removes it from workstation
      fireEvent.click(screen.getByTestId('pos-dismiss-last-sale-btn'));
      expect(screen.queryByTestId('pos-last-completed-sale-banner')).not.toBeInTheDocument();
    });
  });
});
