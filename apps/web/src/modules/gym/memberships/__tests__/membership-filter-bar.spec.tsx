import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React, { useState } from 'react';
import { MembershipFilterBar } from '../components/membership-filter-bar';

jest.mock('../../plans/hooks/use-plans', () => ({
  usePlans: () => ({
    data: {
      items: [
        { id: 'plan-1', name: 'Monthly Unlimited' },
        { id: 'plan-2', name: 'Annual Gold' },
      ],
    },
  }),
}));

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('MembershipFilterBar & Client Search Input', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it('renders with accessible label and placeholder for client name or ID', () => {
    const onSearchChange = jest.fn();
    renderWithProviders(
      <MembershipFilterBar
        search=""
        isFiltered={false}
        onSearchChange={onSearchChange}
        onStatusChange={jest.fn()}
        onPlanChange={jest.fn()}
        onResetFilters={jest.fn()}
      />,
    );

    const input = screen.getByTestId('membership-search-input');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('placeholder', 'Search by client name or ID...');
    expect(input).toHaveAttribute('aria-label', 'Search clients');
  });

  it('preserves all typed characters immediately without dropping any keystrokes', () => {
    const onSearchChange = jest.fn();

    // Wrapper simulating parent state update once debounce commits
    const StatefulWrapper = () => {
      const [search, setSearch] = useState('');
      return (
        <MembershipFilterBar
          search={search}
          isFiltered={Boolean(search)}
          onSearchChange={(q) => {
            onSearchChange(q);
            setSearch(q);
          }}
          onStatusChange={jest.fn()}
          onPlanChange={jest.fn()}
          onResetFilters={jest.fn()}
        />
      );
    };

    renderWithProviders(<StatefulWrapper />);

    const input = screen.getByTestId('membership-search-input') as HTMLInputElement;

    // Simulate rapid typing: J -> Ja -> Jac -> Jack
    fireEvent.change(input, { target: { value: 'J' } });
    expect(input.value).toBe('J');

    fireEvent.change(input, { target: { value: 'Ja' } });
    expect(input.value).toBe('Ja');

    fireEvent.change(input, { target: { value: 'Jac' } });
    expect(input.value).toBe('Jac');

    fireEvent.change(input, { target: { value: 'Jack' } });
    expect(input.value).toBe('Jack');

    // No search call should have happened yet (debouncing)
    expect(onSearchChange).not.toHaveBeenCalled();

    // Advance timers by 299ms - still no search call
    act(() => {
      jest.advanceTimersByTime(299);
    });
    expect(onSearchChange).not.toHaveBeenCalled();

    // Advance 1ms more (reaching 300ms)
    act(() => {
      jest.advanceTimersByTime(1);
    });

    expect(onSearchChange).toHaveBeenCalledTimes(1);
    expect(onSearchChange).toHaveBeenCalledWith('Jack');
    expect(input.value).toBe('Jack');
  });

  it('triggers search immediately on Enter key press without waiting for debounce', () => {
    const onSearchChange = jest.fn();
    renderWithProviders(
      <MembershipFilterBar
        search=""
        isFiltered={false}
        onSearchChange={onSearchChange}
        onStatusChange={jest.fn()}
        onPlanChange={jest.fn()}
        onResetFilters={jest.fn()}
      />,
    );

    const input = screen.getByTestId('membership-search-input');
    fireEvent.change(input, { target: { value: 'Carlos Rivera' } });

    expect(onSearchChange).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(onSearchChange).toHaveBeenCalledTimes(1);
    expect(onSearchChange).toHaveBeenCalledWith('Carlos Rivera');
  });

  it('immediately resets and clears search results when input is emptied', () => {
    const onSearchChange = jest.fn();
    renderWithProviders(
      <MembershipFilterBar
        search="Jack"
        isFiltered={true}
        onSearchChange={onSearchChange}
        onStatusChange={jest.fn()}
        onPlanChange={jest.fn()}
        onResetFilters={jest.fn()}
      />,
    );

    const input = screen.getByTestId('membership-search-input') as HTMLInputElement;
    expect(input.value).toBe('Jack');

    // User deletes all text
    fireEvent.change(input, { target: { value: '' } });

    // Emptied input triggers immediate onSearchChange('') without 300ms delay
    expect(onSearchChange).toHaveBeenCalledTimes(1);
    expect(onSearchChange).toHaveBeenCalledWith('');
    expect(input.value).toBe('');
  });

  it('clears input and cancels pending search when clear button (X) is clicked', () => {
    const onSearchChange = jest.fn();
    renderWithProviders(
      <MembershipFilterBar
        search="CLI-2026-00003"
        isFiltered={true}
        onSearchChange={onSearchChange}
        onStatusChange={jest.fn()}
        onPlanChange={jest.fn()}
        onResetFilters={jest.fn()}
      />,
    );

    const clearButton = screen.getByTestId('membership-search-clear-button');
    expect(clearButton).toBeInTheDocument();

    fireEvent.click(clearButton);

    expect(onSearchChange).toHaveBeenCalledWith('');
    const input = screen.getByTestId('membership-search-input') as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('clears input and triggers onSearchChange on Escape key', () => {
    const onSearchChange = jest.fn();
    renderWithProviders(
      <MembershipFilterBar
        search="Test Client"
        isFiltered={true}
        onSearchChange={onSearchChange}
        onStatusChange={jest.fn()}
        onPlanChange={jest.fn()}
        onResetFilters={jest.fn()}
      />,
    );

    const input = screen.getByTestId('membership-search-input');
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });

    expect(onSearchChange).toHaveBeenCalledWith('');
  });

  it('displays loading spinner when isSearching is true', () => {
    const onSearchChange = jest.fn();
    const { rerender } = renderWithProviders(
      <MembershipFilterBar
        search="Jack"
        isFiltered={true}
        isSearching={false}
        onSearchChange={onSearchChange}
        onStatusChange={jest.fn()}
        onPlanChange={jest.fn()}
        onResetFilters={jest.fn()}
      />,
    );

    expect(screen.queryByTestId('membership-search-loading')).not.toBeInTheDocument();

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MembershipFilterBar
          search="Jack"
          isFiltered={true}
          isSearching={true}
          onSearchChange={onSearchChange}
          onStatusChange={jest.fn()}
          onPlanChange={jest.fn()}
          onResetFilters={jest.fn()}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId('membership-search-loading')).toBeInTheDocument();
  });

  it('synchronizes internal input state when external search prop is reset', () => {
    const onSearchChange = jest.fn();
    const onResetFilters = jest.fn();

    const { rerender } = renderWithProviders(
      <MembershipFilterBar
        search="Initial Search"
        isFiltered={true}
        onSearchChange={onSearchChange}
        onStatusChange={jest.fn()}
        onPlanChange={jest.fn()}
        onResetFilters={onResetFilters}
      />,
    );

    const input = screen.getByTestId('membership-search-input') as HTMLInputElement;
    expect(input.value).toBe('Initial Search');

    // Simulate clicking reset in toolbar or URL reset
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MembershipFilterBar
          search=""
          isFiltered={false}
          onSearchChange={onSearchChange}
          onStatusChange={jest.fn()}
          onPlanChange={jest.fn()}
          onResetFilters={onResetFilters}
        />
      </QueryClientProvider>,
    );

    expect(input.value).toBe('');
  });
});
