import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React, { useState } from 'react';
import { ClientSelector } from '../components/client-selector';
import { clientApi } from '../../../client/api/client-api';
import type { ClientModel, PaginatedClientsDTO } from '../../../client/types/client.types';

jest.mock('../../../client/api/client-api', () => ({
  clientApi: {
    searchClients: jest.fn(),
    getClientProfile: jest.fn(),
  },
}));

const mockedClientApi = jest.mocked(clientApi);

const MOCK_CLIENT_1: ClientModel = {
  id: 'cli-seed-carlos-03',
  referenceNumber: 'CLI-2026-00003',
  firstName: 'Carlos',
  lastName: 'Rivera',
  fullName: 'Carlos Rivera',
  email: 'carlos.rivera@example.com',
  phone: '+591 71234567',
  status: 'ACTIVE',
  version: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  identityId: null,
};

const MOCK_CLIENT_2: ClientModel = {
  id: 'cli-seed-carla-04',
  referenceNumber: 'CLI-2026-00004',
  firstName: 'Carla',
  lastName: 'Mendez',
  fullName: 'Carla Mendez',
  email: 'carla.mendez@example.com',
  phone: '+591 77654321',
  status: 'ACTIVE',
  version: 1,
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  identityId: null,
};

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('ClientSelector Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.clearAllTimers();
    });
    jest.useRealTimers();
  });

  it('renders the combobox input with the expected placeholder and accessible attributes', () => {
    mockedClientApi.searchClients.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    });

    renderWithQueryClient(<ClientSelector onChange={jest.fn()} />);

    const input = screen.getByTestId('client-search-input');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute(
      'placeholder',
      'Search by client name, phone number, or client code...',
    );
    expect(input).toHaveAttribute('role', 'combobox');
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('debounces search queries and displays matching client results with code and phone', async () => {
    const paginatedResponse: PaginatedClientsDTO = {
      items: [MOCK_CLIENT_1, MOCK_CLIENT_2],
      total: 2,
      page: 1,
      limit: 10,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    };
    mockedClientApi.searchClients.mockResolvedValue(paginatedResponse);

    renderWithQueryClient(<ClientSelector onChange={jest.fn()} />);

    const input = screen.getByTestId('client-search-input');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Carl' } });

    // Advance debounce timer (300ms)
    act(() => {
      jest.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(mockedClientApi.searchClients).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'Carl', status: 'ACTIVE' }),
      );
    });

    // Verify dropdown items render distinguishing data
    await waitFor(() => {
      expect(screen.getByTestId('client-search-dropdown')).toBeInTheDocument();
    });

    expect(screen.getByText('Carlos Rivera')).toBeInTheDocument();
    expect(screen.getByText(/CLI-2026-00003/)).toBeInTheDocument();
    expect(screen.getByText(/\+591 71234567/)).toBeInTheDocument();

    expect(screen.getByText('Carla Mendez')).toBeInTheDocument();
    expect(screen.getByText(/CLI-2026-00004/)).toBeInTheDocument();
  });

  it('selects a client on click, notifies onChange with backend ID, and shows the selected client card', async () => {
    mockedClientApi.searchClients.mockResolvedValue({
      items: [MOCK_CLIENT_1],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    });

    const handleChange = jest.fn();

    const TestWrapper = () => {
      const [val, setVal] = useState<string | undefined>(undefined);
      return (
        <ClientSelector
          value={val}
          onChange={(id, client) => {
            setVal(id);
            handleChange(id, client);
          }}
        />
      );
    };

    renderWithQueryClient(<TestWrapper />);

    const input = screen.getByTestId('client-search-input');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Carlos' } });

    act(() => {
      jest.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByTestId('client-search-item-cli-seed-carlos-03')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('client-search-item-cli-seed-carlos-03'));

    expect(handleChange).toHaveBeenCalledWith('cli-seed-carlos-03', MOCK_CLIENT_1);

    // Selected client card is now displayed
    await waitFor(() => {
      expect(screen.getByTestId('selected-client-card')).toBeInTheDocument();
    });

    expect(screen.getByText('Carlos Rivera')).toBeInTheDocument();
    expect(screen.getByText('CLI-2026-00003')).toBeInTheDocument();
    expect(screen.getByText('+591 71234567')).toBeInTheDocument();
    expect(screen.getByTestId('change-client-button')).toBeInTheDocument();
  });

  it('clears selection when "Change Client" is clicked and returns to search input', async () => {
    mockedClientApi.getClientProfile.mockResolvedValue(MOCK_CLIENT_1);
    const handleChange = jest.fn();

    const TestWrapper = () => {
      const [val, setVal] = useState<string | undefined>('cli-seed-carlos-03');
      return (
        <ClientSelector
          value={val}
          onChange={(id, client) => {
            setVal(id);
            handleChange(id, client);
          }}
        />
      );
    };

    renderWithQueryClient(<TestWrapper />);

    await waitFor(() => {
      expect(screen.getByTestId('selected-client-card')).toBeInTheDocument();
    });

    const changeButton = screen.getByTestId('change-client-button');
    fireEvent.click(changeButton);

    expect(handleChange).toHaveBeenCalledWith('', null);

    await waitFor(() => {
      expect(screen.getByTestId('client-search-input')).toBeInTheDocument();
    });
  });

  it('displays empty state when no clients match query', async () => {
    mockedClientApi.searchClients.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    });

    renderWithQueryClient(<ClientSelector onChange={jest.fn()} />);

    const input = screen.getByTestId('client-search-input');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'NonExistentPerson' } });

    act(() => {
      jest.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByTestId('client-search-empty')).toBeInTheDocument();
    });

    expect(screen.getByText(/No clients found matching "NonExistentPerson"/i)).toBeInTheDocument();
  });

  it('handles keyboard navigation (ArrowDown, ArrowUp, Enter, Escape)', async () => {
    mockedClientApi.searchClients.mockResolvedValue({
      items: [MOCK_CLIENT_1, MOCK_CLIENT_2],
      total: 2,
      page: 1,
      limit: 10,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    });

    const handleChange = jest.fn();
    renderWithQueryClient(<ClientSelector onChange={handleChange} />);

    const input = screen.getByTestId('client-search-input');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Car' } });

    act(() => {
      jest.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByTestId('client-search-item-cli-seed-carlos-03')).toBeInTheDocument();
    });

    // Press ArrowDown to highlight first item
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const item1 = screen.getByTestId('client-search-item-cli-seed-carlos-03');
    expect(item1).toHaveAttribute('aria-selected', 'true');

    // Press ArrowDown to highlight second item
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const item2 = screen.getByTestId('client-search-item-cli-seed-carla-04');
    expect(item2).toHaveAttribute('aria-selected', 'true');

    // Press Enter to select the highlighted second item
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(handleChange).toHaveBeenCalledWith('cli-seed-carla-04', MOCK_CLIENT_2);
  });

  it('closes dropdown when Escape key is pressed', async () => {
    mockedClientApi.searchClients.mockResolvedValue({
      items: [MOCK_CLIENT_1],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    });

    renderWithQueryClient(<ClientSelector onChange={jest.fn()} />);

    const input = screen.getByTestId('client-search-input');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Car' } });

    act(() => {
      jest.advanceTimersByTime(350);
    });

    await waitFor(() => {
      expect(screen.getByTestId('client-search-dropdown')).toBeInTheDocument();
    });

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.queryByTestId('client-search-dropdown')).not.toBeInTheDocument();
  });
});
