import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InventoryCreatePage } from '../routes/inventory-create-page';
import * as inventoryMutations from '../hooks/use-inventory-mutations';
import { InventoryCategory, UnitOfMeasure } from '@kinergy-platform/core';

// Polyfill Request if undefined in jsdom for React Router Data Router
if (typeof global.Request === 'undefined') {
  global.Request = class Request {} as unknown as typeof Request;
}

jest.mock('../hooks/use-inventory-mutations', () => ({
  useCreateProduct: jest.fn(),
}));

describe('InventoryCreatePage & ProductCreateForm', () => {
  jest.setTimeout(15000);
  let queryClient: QueryClient;
  const mockMutate = jest.fn();

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    jest.clearAllMocks();

    (inventoryMutations.useCreateProduct as jest.Mock).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      error: null,
    });
  });

  const renderComponent = () => {
    const router = createMemoryRouter(
      [
        {
          path: '/resources/inventory/new',
          element: <InventoryCreatePage />,
        },
        {
          path: '/resources/inventory',
          element: <div>Catalog Page Content</div>,
        },
        {
          path: '/resources/inventory/:id',
          element: <div>Detail Page Content</div>,
        },
      ],
      { initialEntries: ['/resources/inventory/new'] },
    );

    return render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
  };

  it('renders form with sections, labels, and default values', () => {
    renderComponent();

    expect(screen.getByText('Register Consumable Product')).toBeInTheDocument();
    expect(screen.getByText('Identification & Classification')).toBeInTheDocument();
    expect(screen.getByText('Pricing & Valuation')).toBeInTheDocument();
    expect(screen.getByText('Stock Tracking & Thresholds')).toBeInTheDocument();

    expect(screen.getByLabelText(/stock keeping unit/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/product name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/taxonomy category/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/unit of measure/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/unit purchase cost/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/retail selling price/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/reorder threshold quantity/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/initial opening stock/i)).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /register product/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('validates required fields on empty submission and blocks mutation', async () => {
    renderComponent();

    const submitBtn = screen.getByRole('button', { name: /register product/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getAllByText('SKU must be at least 3 characters')[0]).toBeInTheDocument();
      expect(
        screen.getAllByText('Product name must be at least 3 characters')[0],
      ).toBeInTheDocument();
    });

    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('validates numeric constraints against negative values', async () => {
    renderComponent();

    const skuInput = screen.getByLabelText(/stock keeping unit/i);
    const nameInput = screen.getByLabelText(/product name/i);
    const unitCostInput = screen.getByLabelText(/unit purchase cost/i);

    fireEvent.change(skuInput, { target: { value: 'PROT-01' } });
    fireEvent.change(nameInput, { target: { value: 'Protein Powder' } });
    fireEvent.change(unitCostInput, { target: { value: '-15.00' } });

    const submitBtn = screen.getByRole('button', { name: /register product/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getAllByText('Unit cost must be greater than or equal to $0.00')[0],
      ).toBeInTheDocument();
    });

    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('submits valid form data, calls create mutation, and navigates on success', async () => {
    mockMutate.mockImplementation((_payload, options) => {
      setTimeout(() => {
        options?.onSuccess?.({
          id: 'prod-new-123',
          name: 'Organic Plant Protein',
          sku: 'PLANT-PROT-1KG',
        });
      }, 0);
    });

    renderComponent();

    const skuInput = screen.getByLabelText(/stock keeping unit/i);
    const nameInput = screen.getByLabelText(/product name/i);
    const descInput = screen.getByLabelText(/product description/i);
    const categorySelect = screen.getByLabelText(/taxonomy category/i);
    const uomSelect = screen.getByLabelText(/unit of measure/i);
    const unitCostInput = screen.getByLabelText(/unit purchase cost/i);
    const sellingPriceInput = screen.getByLabelText(/retail selling price/i);
    const thresholdInput = screen.getByLabelText(/reorder threshold quantity/i);
    const initialStockInput = screen.getByLabelText(/initial opening stock/i);

    fireEvent.change(skuInput, { target: { value: 'plant-prot-1kg' } });
    fireEvent.change(nameInput, { target: { value: 'Organic Plant Protein' } });
    fireEvent.change(descInput, { target: { value: 'Vanilla vegan protein blend' } });
    fireEvent.change(categorySelect, { target: { value: InventoryCategory.SUPPLEMENTS } });
    fireEvent.change(uomSelect, { target: { value: UnitOfMeasure.BOXES } });
    fireEvent.change(unitCostInput, { target: { value: '24.50' } });
    fireEvent.change(sellingPriceInput, { target: { value: '49.99' } });
    fireEvent.change(thresholdInput, { target: { value: '8' } });
    fireEvent.change(initialStockInput, { target: { value: '25' } });

    const submitBtn = screen.getByRole('button', { name: /register product/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        {
          sku: 'PLANT-PROT-1KG',
          name: 'Organic Plant Protein',
          description: 'Vanilla vegan protein blend',
          category: InventoryCategory.SUPPLEMENTS,
          unitOfMeasure: UnitOfMeasure.BOXES,
          unitCost: 24.5,
          sellingPrice: 49.99,
          reorderThreshold: 8,
          quantityOnHand: 25,
        },
        expect.any(Object),
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Detail Page Content')).toBeInTheDocument();
    });
  });

  it('disables submit button and shows pending state while submitting', () => {
    (inventoryMutations.useCreateProduct as jest.Mock).mockReturnValue({
      mutate: mockMutate,
      isPending: true,
      error: null,
    });

    renderComponent();

    const submitBtn = screen.getByRole('button', { name: /registering|register product/i });
    expect(submitBtn).toBeDisabled();
  });

  it('navigates back to catalog when cancel is clicked', async () => {
    renderComponent();

    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(screen.getByText('Catalog Page Content')).toBeInTheDocument();
    });
  });

  it('renders backend error when creation mutation fails', () => {
    (inventoryMutations.useCreateProduct as jest.Mock).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      error: new Error("Inventory item with SKU 'PLANT-PROT-1KG' already exists."),
    });

    renderComponent();

    expect(
      screen.getByText("Inventory item with SKU 'PLANT-PROT-1KG' already exists."),
    ).toBeInTheDocument();
  });

  it('triggers discard confirmation dialog when navigating away with dirty form', async () => {
    renderComponent();

    const nameInput = screen.getByLabelText(/product name/i);
    fireEvent.change(nameInput, { target: { value: 'Incomplete Draft Product' } });

    const backLink = screen.getByRole('link', { name: /back to catalog/i });
    fireEvent.click(backLink);

    await waitFor(() => {
      expect(screen.getByText('Discard unsaved product data?')).toBeInTheDocument();
    });

    // Cancel keep editing
    const keepEditingBtn = screen.getByRole('button', { name: /keep editing/i });
    fireEvent.click(keepEditingBtn);

    await waitFor(() => {
      expect(screen.queryByText('Discard unsaved product data?')).not.toBeInTheDocument();
      expect(screen.getByDisplayValue('Incomplete Draft Product')).toBeInTheDocument();
    });
  });
});
