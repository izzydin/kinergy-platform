import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AssetCreatePage } from '../routes/asset-create-page';
import * as assetQueries from '../hooks/use-assets-queries';
import * as assetMutations from '../hooks/use-assets-mutations';
import { FacilityOptionVM } from '../types/assets.types';

// Polyfill Request if undefined in jsdom for React Router Data Router
if (typeof global.Request === 'undefined') {
  global.Request = class Request {} as unknown as typeof Request;
}

jest.mock('../hooks/use-assets-queries', () => {
  const actual = jest.requireActual('../hooks/use-assets-queries');
  return {
    ...actual,
    useFacilitiesList: jest.fn(),
  };
});
jest.mock('../hooks/use-assets-mutations');

describe('Asset Facility Selection UX & Tenant Context', () => {
  let queryClient: QueryClient;
  const mockMutate = jest.fn();

  const mockFacilities: FacilityOptionVM[] = [
    {
      id: 'fac-main',
      name: 'Kinergy Main Campus',
      code: 'FAC-MAIN',
      status: 'ACTIVE',
      tenantId: 'tenant-kinergy-main',
      description: 'Primary clinical rehabilitation and performance sports center',
      rooms: [
        { id: 'room-cardio-1', name: 'Cardio Suite A' },
        { id: 'room-plinth-2', name: 'Kinesiology Treatment Room 2' },
      ],
    },
    {
      id: 'fac-west',
      name: 'Kinergy West Branch',
      code: 'FAC-WEST',
      status: 'ACTIVE',
      tenantId: 'tenant-kinergy-main',
      description: 'Secondary outpatient recovery facility',
      rooms: [{ id: 'room-gym-1', name: 'Free Weight Gym' }],
    },
    {
      id: 'fac-north',
      name: 'Kinergy North Satellite',
      code: 'FAC-NORTH',
      status: 'ACTIVE',
      tenantId: 'tenant-kinergy-main',
      description: 'Satellite diagnostic center',
    },
  ];

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
      ],
      { initialEntries: ['/resources/assets/new'] },
    );

    return render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
  };

  it('1. shows loading spinner state while fetching tenant facilities', () => {
    (assetQueries.useFacilitiesList as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    renderComponent();

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/loading facilities/i)).toBeInTheDocument();
  });

  it('2. displays error state with retry action when facility query fails', () => {
    const mockRefetch = jest.fn();
    (assetQueries.useFacilitiesList as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Failed to resolve tenant facility catalog'),
      refetch: mockRefetch,
    });

    renderComponent();

    expect(screen.getByText(/failed to load facilities/i)).toBeInTheDocument();
    expect(screen.getByText(/failed to resolve tenant facility catalog/i)).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /retry/i });
    expect(retryBtn).toBeInTheDocument();

    fireEvent.click(retryBtn);
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('3. displays empty state alert when authenticated tenant has no active facilities', () => {
    (assetQueries.useFacilitiesList as jest.Mock).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    renderComponent();

    expect(screen.getByText(/no accessible facilities available/i)).toBeInTheDocument();
    expect(
      screen.getByText(/no active facilities are registered for your organization/i),
    ).toBeInTheDocument();
  });

  it('4. automatically selects the facility when only a single facility is accessible', () => {
    const singleFacility: FacilityOptionVM[] = [mockFacilities[0]!];
    (assetQueries.useFacilitiesList as jest.Mock).mockReturnValue({
      data: singleFacility,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    renderComponent();

    const select = screen.getByTestId('facility-select') as HTMLSelectElement;
    expect(select.value).toBe('fac-main');
    expect(
      screen.getByText('Primary clinical rehabilitation and performance sports center'),
    ).toBeInTheDocument();
  });

  it('5. renders searchable select and filters facilities when typing in filter input', () => {
    (assetQueries.useFacilitiesList as jest.Mock).mockReturnValue({
      data: mockFacilities,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    renderComponent();

    const filterInput = screen.getByLabelText(/filter facilities/i);
    expect(filterInput).toBeInTheDocument();

    const select = screen.getByTestId('facility-select') as HTMLSelectElement;
    expect(select.options.length).toBe(4); // placeholder + 3 facilities

    // Filter by 'West'
    fireEvent.change(filterInput, { target: { value: 'West' } });

    expect(select.options.length).toBe(2); // placeholder + fac-west
    expect(select.options[1]?.textContent).toContain('Kinergy West Branch');
  });

  it('6. updates selected facility metadata summary and exposes room datalist', () => {
    (assetQueries.useFacilitiesList as jest.Mock).mockReturnValue({
      data: mockFacilities,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    renderComponent();

    const select = screen.getByTestId('facility-select');
    fireEvent.change(select, { target: { value: 'fac-main' } });

    expect(
      screen.getByText('Primary clinical rehabilitation and performance sports center'),
    ).toBeInTheDocument();

    const datalist = document.getElementById('facility-rooms-datalist');
    expect(datalist).toBeInTheDocument();
    expect(datalist?.children.length).toBe(2);
  });

  it('7. submits form with selected facility ID in payload', async () => {
    (assetQueries.useFacilitiesList as jest.Mock).mockReturnValue({
      data: mockFacilities,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    renderComponent();

    fireEvent.change(screen.getByLabelText(/asset barcode tag/i), {
      target: { value: 'AST-FAC-99' },
    });
    fireEvent.change(screen.getByLabelText(/equipment name \/ model/i), {
      target: { value: 'Leg Press Pro' },
    });
    fireEvent.change(screen.getByTestId('facility-select'), { target: { value: 'fac-west' } });
    fireEvent.change(screen.getByLabelText(/room \/ studio/i), { target: { value: 'room-gym-1' } });
    fireEvent.change(screen.getByLabelText(/acquisition date/i), {
      target: { value: '2026-02-01' },
    });
    fireEvent.change(screen.getByLabelText(/purchase acquisition cost/i), {
      target: { value: '2800' },
    });

    const submitBtn = screen.getByRole('button', { name: /commission asset/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          location: expect.objectContaining({
            facilityId: 'fac-west',
            roomId: 'room-gym-1',
          }),
        }),
        expect.anything(),
      );
    });
  });
});
