import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AssetEditPage } from '../routes/asset-edit-page';
import * as assetQueries from '../hooks/use-assets-queries';
import * as assetMutations from '../hooks/use-assets-mutations';
import { AssetCategory, AssetStatus, AssetCondition } from '@kinergy-platform/core';
import type { FixedAssetVM } from '../types';
import { ValidationError } from '../../../../shared/query';

// Polyfill Request if undefined in jsdom
if (typeof global.Request === 'undefined') {
  global.Request = class Request {} as unknown as typeof Request;
}

jest.mock('../hooks/use-assets-queries', () => ({
  useAsset: jest.fn(),
}));

jest.mock('../hooks/use-assets-mutations', () => ({
  useUpdateAssetDetails: jest.fn(),
}));

const MOCK_ACTIVE_ASSET: FixedAssetVM = {
  id: 'ast-101',
  assetTag: 'AST-GYM-001',
  name: 'LifeFitness Treadmill 95T',
  description: 'Commercial cardio treadmill with touch console',
  category: AssetCategory.GYM_EQUIPMENT,
  status: AssetStatus.ACTIVE,
  condition: AssetCondition.GOOD,
  purchaseDate: '2025-06-15',
  location: {
    facilityId: 'fac-main',
    roomId: 'Cardio Suite',
    zone: 'Zone 2',
  },
  version: 1,
  createdAt: '2025-06-15T10:00:00.000Z',
  updatedAt: '2025-06-15T10:00:00.000Z',
};

const MOCK_SOLD_ASSET: FixedAssetVM = {
  ...MOCK_ACTIVE_ASSET,
  id: 'ast-sold-99',
  assetTag: 'AST-SOLD-001',
  status: AssetStatus.SOLD,
  condition: AssetCondition.OUT_OF_SERVICE,
};

describe('AssetEditPage & AssetEditForm Integration', () => {
  jest.setTimeout(15000);
  let queryClient: QueryClient;
  const mockUpdateDetails = jest.fn();

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    jest.clearAllMocks();

    (assetQueries.useAsset as jest.Mock).mockReturnValue({
      data: MOCK_ACTIVE_ASSET,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    (assetMutations.useUpdateAssetDetails as jest.Mock).mockReturnValue({
      mutate: mockUpdateDetails,
      isPending: false,
      error: null,
    });
  });

  const renderComponent = (assetId: string = 'ast-101') => {
    const router = createMemoryRouter(
      [
        {
          path: '/resources/assets/:id/edit',
          element: <AssetEditPage />,
        },
        {
          path: '/resources/assets/:id',
          element: <div>Asset Detail Cockpit: {assetId}</div>,
        },
        {
          path: '/resources/assets',
          element: <div>Asset Catalog Content</div>,
        },
      ],
      { initialEntries: [`/resources/assets/${assetId}/edit`] },
    );

    return render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
  };

  describe('1. Form Hydration & Field Rendering', () => {
    it('hydrates form with current asset values and displays immutable identity fields', () => {
      renderComponent();

      // Heading
      expect(screen.getByText('Edit Asset Details: ast-101')).toBeInTheDocument();

      // Immutable identity displays
      expect(screen.getByText('AST-GYM-001')).toBeInTheDocument();
      expect(screen.getAllByText('Immutable').length).toBeGreaterThanOrEqual(2);

      // Hydrated editable fields
      const nameInput = screen.getByLabelText(/equipment name \/ model/i) as HTMLInputElement;
      expect(nameInput.value).toBe('LifeFitness Treadmill 95T');

      const descInput = screen.getByLabelText(/equipment specifications/i) as HTMLInputElement;
      expect(descInput.value).toBe('Commercial cardio treadmill with touch console');

      expect(screen.getByLabelText(/audit change reason/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/operational remarks \/ notes/i)).toBeInTheDocument();
    });

    it('renders loading skeleton when query is in-flight', () => {
      (assetQueries.useAsset as jest.Mock).mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
      });

      renderComponent();

      expect(screen.getByTestId('asset-edit-loading')).toBeInTheDocument();
    });

    it('renders not-found error state when asset does not exist', () => {
      (assetQueries.useAsset as jest.Mock).mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('Asset with ID ast-unknown not found'),
      });

      renderComponent('ast-unknown');

      expect(screen.getByTestId('asset-edit-error')).toBeInTheDocument();
      expect(screen.getByText('Asset Not Found')).toBeInTheDocument();
      expect(screen.getByText(/Asset with ID ast-unknown not found/i)).toBeInTheDocument();
    });
  });

  describe('2. Explicit Domain Lifecycle Boundaries', () => {
    it('prohibits editing status, condition, and location as arbitrary generic text fields', () => {
      renderComponent();

      // Verify that status, condition, and location are NOT editable form inputs
      expect(screen.queryByRole('combobox', { name: /opening status/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('combobox', { name: /condition rating/i })).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/facility code/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/purchase acquisition cost/i)).not.toBeInTheDocument();

      // Verify explicit domain governance notices directing user to dedicated workflows
      expect(screen.getByText(/Governed Lifecycle Dimensions/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Physical relocations require audited location transfers/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Status transitions and condition assessments are strictly audited/i),
      ).toBeInTheDocument();
    });
  });

  describe('3. Successful Submission & Navigation', () => {
    it('submits modified descriptive metadata with change reason and navigates to cockpit', async () => {
      mockUpdateDetails.mockImplementation(({ payload }, options) => {
        setTimeout(() => {
          options?.onSuccess?.({
            ...MOCK_ACTIVE_ASSET,
            ...payload,
          });
        }, 0);
      });

      renderComponent();

      const nameInput = screen.getByLabelText(/equipment name \/ model/i);
      const reasonInput = screen.getByLabelText(/audit change reason/i);
      const notesInput = screen.getByLabelText(/operational remarks \/ notes/i);

      fireEvent.change(nameInput, { target: { value: 'LifeFitness Treadmill 95T Pro Edition' } });
      fireEvent.change(reasonInput, { target: { value: 'Console software upgrade' } });
      fireEvent.change(notesInput, { target: { value: 'Upgraded firmware to v4.2' } });

      const submitBtn = screen.getByRole('button', { name: /save changes/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockUpdateDetails).toHaveBeenCalledWith(
          {
            id: 'ast-101',
            payload: {
              name: 'LifeFitness Treadmill 95T Pro Edition',
              description: 'Commercial cardio treadmill with touch console',
              notes: 'Upgraded firmware to v4.2',
              reason: 'Console software upgrade',
            },
          },
          expect.any(Object),
        );
      });

      // Navigates back to the asset cockpit
      await waitFor(() => {
        expect(screen.getByText('Asset Detail Cockpit: ast-101')).toBeInTheDocument();
      });
    });

    it('navigates back to cockpit when cancel is clicked', () => {
      renderComponent();

      const cancelBtn = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelBtn);

      expect(screen.getByText('Asset Detail Cockpit: ast-101')).toBeInTheDocument();
    });
  });

  describe('4. Terminal State Protection (SOLD / RETIRED)', () => {
    it('renders terminal warning banner and disables all form inputs for decommissioned assets', () => {
      (assetQueries.useAsset as jest.Mock).mockReturnValue({
        data: MOCK_SOLD_ASSET,
        isLoading: false,
        isError: false,
      });

      renderComponent('ast-sold-99');

      // Warning alert
      expect(screen.getByTestId('terminal-asset-alert')).toBeInTheDocument();
      expect(screen.getByText(/Terminal Lifecycle State \(SOLD\)/i)).toBeInTheDocument();
      expect(screen.getByText(/permanently locked against modifications/i)).toBeInTheDocument();

      // Inputs disabled
      const nameInput = screen.getByLabelText(/equipment name \/ model/i);
      expect(nameInput).toBeDisabled();

      // Submit button reflects locked decommissioned state
      const submitBtn = screen.getByRole('button', { name: /asset decommissioned/i });
      expect(submitBtn).toBeDisabled();
    });
  });

  describe('5. Server Error Mapping', () => {
    it('applies server domain errors to form fields', () => {
      const serverValidationError = new ValidationError('Update rejected', {
        name: ['Equipment name cannot conflict with active registered model'],
      });

      (assetMutations.useUpdateAssetDetails as jest.Mock).mockReturnValue({
        mutate: mockUpdateDetails,
        isPending: false,
        error: serverValidationError,
      });

      renderComponent();

      expect(
        screen.getByText('Equipment name cannot conflict with active registered model'),
      ).toBeInTheDocument();
    });
  });
});
