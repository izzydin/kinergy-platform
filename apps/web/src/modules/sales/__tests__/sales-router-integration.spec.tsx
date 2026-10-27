import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../../test/test-utils';
import { SalesSubRouter } from '../routes/sales.router';
import { moduleRegistry } from '../../../app/routes/module-registry';

// Mock API to return instant empty results for router mount tests
jest.mock('../api/sales-api', () => ({
  salesApi: {
    listSales: jest
      .fn()
      .mockResolvedValue({ items: [], total: 0, page: 1, limit: 20, totalPages: 1 }),
    getSaleById: jest.fn().mockResolvedValue({
      id: 's1',
      status: 'DRAFT',
      subtotal: { amount: 0 },
      total: { amount: 0 },
      items: [],
    }),
    listPayments: jest
      .fn()
      .mockResolvedValue({ items: [], total: 0, page: 1, limit: 20, totalPages: 1 }),
    getPaymentById: jest
      .fn()
      .mockResolvedValue({ id: 'p1', status: 'PENDING', amount: { amount: 10 } }),
    getReceiptBySale: jest.fn().mockResolvedValue({
      id: 'r1',
      receiptNumber: 'REC-001',
      subtotal: { amount: 10 },
      total: { amount: 10 },
      items: [],
      payments: [],
    }),
    getSalePaymentHistory: jest.fn().mockResolvedValue([]),
  },
}));

describe('Sales SubRouter & Module Route Contract Integration', () => {
  it('registers sales module in moduleRegistry', () => {
    const registered = moduleRegistry.getRegisteredModules().find((m) => m.id === 'sales');
    expect(registered).toBeDefined();
    expect(registered?.prefix).toBe('/sales');
    expect(registered?.requiredPermissions).toEqual(['sales.read']);
  });

  it('renders SalesOverviewPage on default route /', async () => {
    renderWithProviders(<SalesSubRouter />, {
      initialRoute: '/',
      initialSessionOverride: {
        id: 'usr_manager',
        name: 'Manager User',
        email: 'manager@example.com',
        roles: ['Manager'],
        permissions: ['sales.read', 'sales.create'],
      },
    });

    expect(
      await screen.findByTestId('sales-overview-page', {}, { timeout: 10000 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Sales & Payments Overview/i)).toBeInTheDocument();
  });

  it('renders SalesListPage on /list route', async () => {
    renderWithProviders(<SalesSubRouter />, {
      initialRoute: '/list',
      initialSessionOverride: {
        id: 'usr_cashier',
        name: 'Cashier User',
        email: 'cashier@example.com',
        roles: ['Receptionist'],
        permissions: ['sales.read'],
      },
    });

    expect(
      await screen.findByTestId('sales-list-page', {}, { timeout: 10000 }),
    ).toBeInTheDocument();
  });

  it('renders SaleCreatePage on /new route with sales.create permission', async () => {
    renderWithProviders(<SalesSubRouter />, {
      initialRoute: '/new',
      initialSessionOverride: {
        id: 'usr_cashier',
        name: 'Cashier User',
        email: 'cashier@example.com',
        roles: ['Receptionist'],
        permissions: ['sales.create'],
      },
    });

    expect(
      await screen.findByTestId('sale-create-page', {}, { timeout: 10000 }),
    ).toBeInTheDocument();
  });

  it('renders PaymentHistoryPage on /payments route', async () => {
    renderWithProviders(<SalesSubRouter />, {
      initialRoute: '/payments',
      initialSessionOverride: {
        id: 'usr_mgr',
        name: 'Manager User',
        email: 'mgr@example.com',
        roles: ['Manager'],
        permissions: ['payments.read'],
      },
    });

    expect(
      await screen.findByTestId('payment-history-page', {}, { timeout: 10000 }),
    ).toBeInTheDocument();
  });

  it('denies access with 403 ForbiddenView when user lacks permission', async () => {
    renderWithProviders(<SalesSubRouter />, {
      initialRoute: '/new',
      initialSessionOverride: {
        id: 'usr_guest',
        name: 'Guest User',
        email: 'guest@example.com',
        roles: ['Guest'],
        permissions: ['unrelated.read'], // lacks sales.create
      },
    });

    expect(
      await screen.findByText(/403 — Access Denied/i, {}, { timeout: 10000 }),
    ).toBeInTheDocument();
  });
});
