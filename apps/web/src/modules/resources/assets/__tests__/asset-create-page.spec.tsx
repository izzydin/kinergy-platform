import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AssetCreatePage } from '../routes/asset-create-page';
import * as assetMutations from '../hooks/use-assets-mutations';
import { AssetCategory, AssetStatus, AssetCondition } from '@kinergy-platform/core';
import { ValidationError } from '../../../../shared/query';

// Polyfill Request if undefined in jsdom for React Router Data Router
if (typeof global.Request === 'undefined') {
  global.Request = class Request {} as unknown as typeof Request;
}

jest.mock('../hooks/use-assets-mutations', () => ({
  useCreateAsset: jest.fn(),
}));

describe('AssetCreatePage & AssetCreateForm Integration', () => {
  jest.setTimeout(15000);
  let queryClient: QueryClient;
  const mockMutate = jest.fn();

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    jest.clearAllMocks();

    (assetMutations.useCreateAsset as jest.Mock).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      error: null,
    });
  });

  const renderComponent = () => {
    const router = createMemoryRouter(
      [
        {
          path: '/resources/assets/new',
          element: <AssetCreatePage />,
        },
        {
          path: '/resources/assets',
          element: <div>Asset Catalog Content</div>,
        },
        {
          path: '/resources/assets/:id',
          element: <div>Asset Cockpit Detail Content</div>,
        },
      ],
      { initialEntries: ['/resources/assets/new'] },
    );

    return render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
  };

  describe('1. Form Field & Section Rendering', () => {
    it('renders form sections, field labels, and default values', () => {
      renderComponent();

      // Title & Sections
      expect(screen.getByText('Commission New Fixed Asset')).toBeInTheDocument();
      expect(screen.getByText('Hardware Identification & Taxonomy')).toBeInTheDocument();
      expect(screen.getByText('Physical Deployment Location')).toBeInTheDocument();
      expect(screen.getByText('Capital Acquisition & Carrying Valuation')).toBeInTheDocument();
      expect(screen.getByText('Initial Operational State & Condition')).toBeInTheDocument();

      // Field labels
      expect(screen.getByLabelText(/asset barcode tag/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/equipment name \/ model/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/asset category/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/facility code/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/acquisition date/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/purchase acquisition cost/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/opening status/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/physical condition rating/i)).toBeInTheDocument();

      // Form actions
      expect(screen.getByRole('button', { name: /commission asset/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });
  });

  describe('2. Client-Side Field Validation', () => {
    it('validates required fields on empty submission and prevents mutation', async () => {
      renderComponent();

      const submitBtn = screen.getByRole('button', { name: /commission asset/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(
          screen.getAllByText('Asset tag must be at least 3 characters')[0],
        ).toBeInTheDocument();
        expect(
          screen.getAllByText('Asset name must be at least 2 characters')[0],
        ).toBeInTheDocument();
        expect(screen.getAllByText('Facility selection is required')[0]).toBeInTheDocument();
      });

      expect(mockMutate).not.toHaveBeenCalled();
    });

    it('rejects negative purchase values', async () => {
      renderComponent();

      const tagInput = screen.getByLabelText(/asset barcode tag/i);
      const nameInput = screen.getByLabelText(/equipment name \/ model/i);
      const facilityInput = screen.getByLabelText(/facility code/i);
      const costInput = screen.getByLabelText(/purchase acquisition cost/i);

      fireEvent.change(tagInput, { target: { value: 'AST-GYM-001' } });
      fireEvent.change(nameInput, { target: { value: 'Treadmill T80' } });
      fireEvent.change(facilityInput, { target: { value: 'fac-main' } });
      fireEvent.change(costInput, { target: { value: '-250.00' } });

      const submitBtn = screen.getByRole('button', { name: /commission asset/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(
          screen.getAllByText('Purchase cost must be greater than or equal to $0.00')[0],
        ).toBeInTheDocument();
      });

      expect(mockMutate).not.toHaveBeenCalled();
    });
  });

  describe('3. Submission & Post-Commissioning Navigation', () => {
    it('submits valid form data and navigates to new asset cockpit upon success', async () => {
      mockMutate.mockImplementation((_payload, options) => {
        setTimeout(() => {
          options?.onSuccess?.({
            id: 'ast-new-123',
            name: 'Commercial Treadmill X9',
            assetTag: 'AST-GYM-101',
          });
        }, 0);
      });

      renderComponent();

      const tagInput = screen.getByLabelText(/asset barcode tag/i);
      const nameInput = screen.getByLabelText(/equipment name \/ model/i);
      const descInput = screen.getByLabelText(/equipment specifications/i);
      const categorySelect = screen.getByLabelText(/asset category/i);
      const facilityInput = screen.getByLabelText(/facility code/i);
      const roomInput = screen.getByLabelText(/room \/ studio/i);
      const zoneInput = screen.getByLabelText(/floor \/ zone/i);
      const dateInput = screen.getByLabelText(/acquisition date/i);
      const costInput = screen.getByLabelText(/purchase acquisition cost/i);
      const statusSelect = screen.getByLabelText(/opening status/i);
      const conditionSelect = screen.getByLabelText(/physical condition rating/i);
      const notesInput = screen.getByLabelText(/commissioning notes/i);

      fireEvent.change(tagInput, { target: { value: 'ast-gym-101' } });
      fireEvent.change(nameInput, { target: { value: 'Commercial Treadmill X9' } });
      fireEvent.change(descInput, { target: { value: 'Incline trainer with touchscreen' } });
      fireEvent.change(categorySelect, { target: { value: AssetCategory.GYM_EQUIPMENT } });
      fireEvent.change(facilityInput, { target: { value: 'fac-main' } });
      fireEvent.change(roomInput, { target: { value: 'room-cardio-1' } });
      fireEvent.change(zoneInput, { target: { value: 'Zone A' } });
      fireEvent.change(dateInput, { target: { value: '2026-01-15' } });
      fireEvent.change(costInput, { target: { value: '3500.00' } });
      fireEvent.change(statusSelect, { target: { value: AssetStatus.ACTIVE } });
      fireEvent.change(conditionSelect, { target: { value: AssetCondition.EXCELLENT } });
      fireEvent.change(notesInput, { target: { value: 'Serial SN-998822 on frame' } });

      const submitBtn = screen.getByRole('button', { name: /commission asset/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalledWith(
          expect.objectContaining({
            assetTag: 'AST-GYM-101',
            name: 'Commercial Treadmill X9',
            description: 'Incline trainer with touchscreen',
            category: AssetCategory.GYM_EQUIPMENT,
            purchaseDate: '2026-01-15',
            purchaseValueAmount: 3500,
            purchaseValueCurrency: 'USD',
            status: AssetStatus.ACTIVE,
            condition: AssetCondition.EXCELLENT,
            location: {
              facilityId: 'fac-main',
              roomId: 'room-cardio-1',
              zone: 'Zone A',
              description: undefined,
            },
            notes: 'Serial SN-998822 on frame',
          }),
          expect.any(Object),
        );
      });

      // Verifies navigation to new asset cockpit detail page
      await waitFor(() => {
        expect(screen.getByText('Asset Cockpit Detail Content')).toBeInTheDocument();
      });
    });
  });

  describe('4. Pending & Server Validation Error Handling', () => {
    it('disables submit button during pending mutation', () => {
      (assetMutations.useCreateAsset as jest.Mock).mockReturnValue({
        mutate: mockMutate,
        isPending: true,
        error: null,
      });

      renderComponent();

      const submitBtn = screen.getByRole('button', { name: /commission asset/i });
      expect(submitBtn).toBeDisabled();
    });

    it('maps backend validation conflict errors onto the relevant form fields', () => {
      const serverValidationError = new ValidationError('Validation failed', {
        assetTag: ['Asset tag AST-GYM-001 already exists in tenant estate'],
      });

      (assetMutations.useCreateAsset as jest.Mock).mockReturnValue({
        mutate: mockMutate,
        isPending: false,
        error: serverValidationError,
      });

      renderComponent();

      expect(
        screen.getByText('Asset tag AST-GYM-001 already exists in tenant estate'),
      ).toBeInTheDocument();
    });

    it('navigates back to asset catalog when cancel button is clicked', () => {
      renderComponent();

      const cancelBtn = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelBtn);

      expect(screen.getByText('Asset Catalog Content')).toBeInTheDocument();
    });

    it('resets form inputs when reset button is activated', () => {
      renderComponent();

      const tagInput = screen.getByLabelText(/asset barcode tag/i) as HTMLInputElement;
      fireEvent.change(tagInput, { target: { value: 'AST-TEMP-99' } });
      expect(tagInput.value).toBe('AST-TEMP-99');

      const resetBtn = screen.getByRole('button', { name: /reset/i });
      fireEvent.click(resetBtn);

      expect(tagInput.value).toBe('');
    });
  });
});
