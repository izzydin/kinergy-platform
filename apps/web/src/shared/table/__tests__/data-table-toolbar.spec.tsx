import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { DataTableFacetedFilter } from '../components/data-table-faceted-filter';
import { DataTableSearch } from '../components/data-table-search';
import { DataTableToolbar } from '../components/data-table-toolbar';

describe('DataTable Toolbar & Filter Components (Track C Step C2.3)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('DataTableSearch', () => {
    it('debounces search input and fires onChange after specified delay', () => {
      const handleChange = jest.fn();
      render(<DataTableSearch value="" onChange={handleChange} debounceMs={300} />);

      const input = screen.getByRole('searchbox', { name: /search table records/i });
      fireEvent.change(input, { target: { value: 'alice' } });

      // Before timer expires
      expect(handleChange).not.toHaveBeenCalled();

      // Fast-forward 300ms
      act(() => {
        jest.advanceTimersByTime(300);
      });

      expect(handleChange).toHaveBeenCalledTimes(1);
      expect(handleChange).toHaveBeenCalledWith('alice');
    });

    it('clears query immediately when clear button (X) is clicked', () => {
      const handleChange = jest.fn();
      render(<DataTableSearch value="existing search" onChange={handleChange} />);

      const clearBtn = screen.getByRole('button', { name: /clear search query/i });
      fireEvent.click(clearBtn);

      expect(handleChange).toHaveBeenCalledWith('');
    });

    it('clears query immediately on Escape key', () => {
      const handleChange = jest.fn();
      render(<DataTableSearch value="term" onChange={handleChange} />);

      const input = screen.getByRole('searchbox');
      fireEvent.keyDown(input, { key: 'Escape' });

      expect(handleChange).toHaveBeenCalledWith('');
    });

    it('updates internal state when external value changes', () => {
      const handleChange = jest.fn();
      const { rerender } = render(<DataTableSearch value="initial" onChange={handleChange} />);

      const input = screen.getByRole('searchbox') as HTMLInputElement;
      expect(input.value).toBe('initial');

      rerender(<DataTableSearch value="updated" onChange={handleChange} />);
      expect(input.value).toBe('updated');
    });
  });

  describe('DataTableFacetedFilter', () => {
    const roleOptions = [
      { label: 'Admin', value: 'ADMIN', count: 4 },
      { label: 'Operator', value: 'OPERATOR', count: 12 },
      { label: 'Member', value: 'MEMBER', count: 25 },
    ];

    it('renders trigger button and toggles open state on click', () => {
      const handleSelect = jest.fn();
      render(
        <DataTableFacetedFilter
          title="Role"
          options={roleOptions}
          selectedValues={undefined}
          onSelect={handleSelect}
        />,
      );

      const triggerBtn = screen.getByRole('button', { name: /filter by role/i });
      expect(triggerBtn).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(triggerBtn);
      expect(triggerBtn).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('menu', { name: /role filter options/i })).toBeInTheDocument();
      expect(screen.getByText('Admin')).toBeInTheDocument();
      expect(screen.getByText('Operator')).toBeInTheDocument();
    });

    it('handles single-select selection and fires onSelect', () => {
      const handleSelect = jest.fn();
      render(
        <DataTableFacetedFilter
          title="Role"
          options={roleOptions}
          selectedValues={undefined}
          onSelect={handleSelect}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: /filter by role/i }));
      fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /admin/i }));

      expect(handleSelect).toHaveBeenCalledWith('ADMIN');
    });

    it('handles multi-select selection and toggles options', () => {
      const handleSelect = jest.fn();
      render(
        <DataTableFacetedFilter
          title="Role"
          options={roleOptions}
          selectedValues={['ADMIN']}
          onSelect={handleSelect}
          multiSelect={true}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: /filter by role/i }));
      fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /operator/i }));

      expect(handleSelect).toHaveBeenCalledWith(['ADMIN', 'OPERATOR']);
    });

    it('provides clear filter action inside menu', () => {
      const handleSelect = jest.fn();
      render(
        <DataTableFacetedFilter
          title="Role"
          options={roleOptions}
          selectedValues="ADMIN"
          onSelect={handleSelect}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: /filter by role/i }));
      const clearBtn = screen.getByRole('button', { name: /clear filter/i });
      fireEvent.click(clearBtn);

      expect(handleSelect).toHaveBeenCalledWith(undefined);
    });
  });

  describe('DataTableToolbar', () => {
    it('renders search, filter facets, and actions with conditional reset button', () => {
      const handleReset = jest.fn();

      const { rerender } = render(
        <DataTableToolbar
          search={<span data-testid="search-node">Search</span>}
          filters={<span data-testid="filter-node">Filters</span>}
          isFiltered={false}
          onResetFilters={handleReset}
          actions={<button type="button">Create</button>}
        />,
      );

      expect(screen.getByTestId('search-node')).toBeInTheDocument();
      expect(screen.getByTestId('filter-node')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /reset/i })).not.toBeInTheDocument();

      // When isFiltered = true
      rerender(
        <DataTableToolbar
          search={<span data-testid="search-node">Search</span>}
          filters={<span data-testid="filter-node">Filters</span>}
          isFiltered={true}
          onResetFilters={handleReset}
          actions={<button type="button">Create</button>}
        />,
      );

      const resetBtn = screen.getByRole('button', { name: /reset/i });
      expect(resetBtn).toBeInTheDocument();

      fireEvent.click(resetBtn);
      expect(handleReset).toHaveBeenCalledTimes(1);
    });
  });
});
