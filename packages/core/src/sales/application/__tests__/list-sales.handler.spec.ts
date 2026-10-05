import { ListSalesHandler } from '../queries/list-sales.handler';
import { ListSalesQuery } from '../queries/list-sales.query';
import {
  SaleRepositoryPort,
  FindSalesCriteria,
  FindSalesPagination,
  FindSalesSort,
  FindSalesResult,
} from '../ports/sale-repository.port';
import { Sale } from '../../domain/sale.aggregate';
import { SaleId } from '../../domain/value-objects/sale-id.vo';
import { SaleSource } from '../../domain/value-objects/sale-source.vo';
import { Money } from '../../domain/value-objects/money.vo';
import { SaleSourceType } from '../../domain/enums/sale-source-type.enum';
import { SaleStatus } from '../../domain/enums/sale-status.enum';
import { DeterministicClock } from '../../domain/shared/clock';
import { SaleMapper } from '../mappers/sale.mapper';
import { SaleSummaryDTO } from '../dtos/sale.dto';
import { InvalidSaleQueryException } from '../exceptions/invalid-sale-query.exception';

class InMemorySaleRepository implements SaleRepositoryPort {
  public store = new Map<string, Sale>();
  public itemsOverride?: SaleSummaryDTO[];
  public lastCriteria?: FindSalesCriteria;
  public lastPagination?: FindSalesPagination;
  public lastSort?: FindSalesSort;
  public throwOnFind?: Error;

  async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async save(sale: Sale): Promise<void> {
    this.store.set(sale.id.value, sale);
  }

  async findMany(
    criteria: FindSalesCriteria,
    pagination: FindSalesPagination,
    sort: FindSalesSort,
  ): Promise<FindSalesResult> {
    this.lastCriteria = criteria;
    this.lastPagination = pagination;
    this.lastSort = sort;

    if (this.throwOnFind) {
      throw this.throwOnFind;
    }

    let summaries = this.itemsOverride
      ? [...this.itemsOverride]
      : Array.from(this.store.values()).map((sale) => SaleMapper.toSummaryDTO(sale));

    // Apply filtering
    if (criteria.tenantId) {
      summaries = summaries.filter((s) => s.tenantId === criteria.tenantId);
    }
    if (criteria.clientId) {
      summaries = summaries.filter((s) => s.clientId === criteria.clientId);
    }
    if (criteria.status) {
      summaries = summaries.filter((s) => s.status === criteria.status);
    }
    if (criteria.sourceType) {
      summaries = summaries.filter((s) => s.source?.sourceType === criteria.sourceType);
    }
    if (criteria.sourceReferenceId) {
      summaries = summaries.filter((s) => s.source?.sourceId === criteria.sourceReferenceId);
    }
    if (criteria.fromDate) {
      summaries = summaries.filter((s) => new Date(s.createdAt) >= criteria.fromDate!);
    }
    if (criteria.toDate) {
      summaries = summaries.filter((s) => new Date(s.createdAt) <= criteria.toDate!);
    }

    // Apply sorting with deterministic tie-breaker (id asc)
    summaries.sort((a, b) => {
      let comparison: number;
      if (sort.field === 'total') {
        comparison = a.totalAmount - b.totalAmount;
      } else if (sort.field === 'status') {
        comparison = a.status.localeCompare(b.status);
      } else {
        // createdAt
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }

      if (comparison !== 0) {
        return sort.direction === 'desc' ? -comparison : comparison;
      }

      // Deterministic secondary sort: id asc
      return a.id.localeCompare(b.id);
    });

    const total = summaries.length;
    const skip = (pagination.page - 1) * pagination.limit;
    const paginatedItems = summaries.slice(skip, skip + pagination.limit);

    return {
      items: paginatedItems,
      total,
    };
  }

  clear(): void {
    this.store.clear();
    this.itemsOverride = undefined;
    this.lastCriteria = undefined;
    this.lastPagination = undefined;
    this.lastSort = undefined;
    this.throwOnFind = undefined;
  }
}

function getErrorMessage(result: { getError(): Error | string | null }): string {
  const err = result.getError();
  return err instanceof Error ? err.message : String(err ?? '');
}

describe('ListSalesHandler Specification (Milestone 7.11 & ADR-0132 Section 4.7)', () => {
  let saleRepo: InMemorySaleRepository;
  let handler: ListSalesHandler;

  beforeEach(() => {
    saleRepo = new InMemorySaleRepository();
    handler = new ListSalesHandler(saleRepo);
  });

  const createSaleWithProps = (props: {
    id: string;
    tenantId?: string;
    clientId?: string;
    sourceType?: SaleSourceType | string;
    sourceId?: string;
    unitPrice?: number;
    quantity?: number;
    status?: SaleStatus;
    timestamp?: Date;
  }): Sale => {
    const clock = new DeterministicClock(props.timestamp ?? new Date('2026-10-01T10:00:00.000Z'));
    const source = SaleSource.create(
      (props.sourceType as SaleSourceType) ?? SaleSourceType.FOOD,
      props.sourceId ?? `item_${props.id}`,
    );

    const sale = Sale.create(
      {
        id: SaleId.create(props.id),
        tenantId: props.tenantId ?? 'tenant_01',
        clientId: props.clientId ?? 'client_01',
        currency: 'USD',
        source,
      },
      clock,
    );

    sale.addItem(
      {
        source,
        description: `Line item for ${props.id}`,
        quantity: props.quantity ?? 1,
        unitPrice: Money.create(props.unitPrice ?? 50, 'USD'),
      },
      clock,
    );

    // If status requested is not DRAFT, set it if needed
    if (props.status && props.status !== SaleStatus.DRAFT) {
      if (props.status === SaleStatus.CANCELLED) {
        sale.cancel('Order cancelled for testing', clock);
      }
    }

    return sale;
  };

  describe('Default Pagination & Bounds', () => {
    it('applies default pagination: page 1, limit 20 when parameters are omitted', async () => {
      // Seed 25 sales
      for (let i = 1; i <= 25; i++) {
        const id = `sale_${String(i).padStart(3, '0')}`;
        const sale = createSaleWithProps({ id, unitPrice: i * 10 });
        await saleRepo.save(sale);
      }

      const result = await handler.execute(new ListSalesQuery({}));

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();

      expect(data.page).toBe(1);
      expect(data.limit).toBe(20);
      expect(data.total).toBe(25);
      expect(data.totalPages).toBe(2);
      expect(data.items.length).toBe(20);
      expect(data.hasNextPage).toBe(true);
      expect(data.hasPreviousPage).toBe(false);
    });

    it('navigates to subsequent pages correctly', async () => {
      for (let i = 1; i <= 25; i++) {
        const id = `sale_${String(i).padStart(3, '0')}`;
        const sale = createSaleWithProps({ id, unitPrice: i * 10 });
        await saleRepo.save(sale);
      }

      const result = await handler.execute(
        new ListSalesQuery({
          page: 2,
          limit: 20,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();

      expect(data.page).toBe(2);
      expect(data.limit).toBe(20);
      expect(data.total).toBe(25);
      expect(data.totalPages).toBe(2);
      expect(data.items.length).toBe(5);
      expect(data.hasNextPage).toBe(false);
      expect(data.hasPreviousPage).toBe(true);
    });

    it('clamps limit to maximum cap of 100', async () => {
      const sale = createSaleWithProps({ id: 'sale_001' });
      await saleRepo.save(sale);

      const result = await handler.execute(
        new ListSalesQuery({
          limit: 500,
        }),
      );

      expect(result.isSuccess).toBe(true);
      expect(saleRepo.lastPagination?.limit).toBe(100);
      expect(result.getValue().limit).toBe(100);
    });

    it('accepts nested pagination object matching ADR-0132 input format', async () => {
      for (let i = 1; i <= 15; i++) {
        const id = `sale_${String(i).padStart(3, '0')}`;
        await saleRepo.save(createSaleWithProps({ id }));
      }

      const result = await handler.execute(
        new ListSalesQuery({
          pagination: { page: 2, limit: 5 },
        }),
      );

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      expect(data.page).toBe(2);
      expect(data.limit).toBe(5);
      expect(data.items.length).toBe(5);
      expect(data.totalPages).toBe(3);
    });
  });

  describe('Invalid Pagination Validation', () => {
    it('rejects page number less than 1', async () => {
      const result = await handler.execute(new ListSalesQuery({ page: 0 }));
      expect(result.isFailure).toBe(true);
      expect(getErrorMessage(result)).toContain(
        'Page must be an integer greater than or equal to 1',
      );
      expect(result.getError()).toBeInstanceOf(InvalidSaleQueryException);
    });

    it('rejects negative page number', async () => {
      const result = await handler.execute(new ListSalesQuery({ page: -3 }));
      expect(result.isFailure).toBe(true);
      expect(getErrorMessage(result)).toContain(
        'Page must be an integer greater than or equal to 1',
      );
    });

    it('rejects non-integer page number', async () => {
      const result = await handler.execute(new ListSalesQuery({ page: 2.7 }));
      expect(result.isFailure).toBe(true);
      expect(getErrorMessage(result)).toContain(
        'Page must be an integer greater than or equal to 1',
      );
    });

    it('rejects limit less than 1', async () => {
      const result = await handler.execute(new ListSalesQuery({ limit: 0 }));
      expect(result.isFailure).toBe(true);
      expect(getErrorMessage(result)).toContain(
        'Limit must be an integer greater than or equal to 1',
      );
    });

    it('rejects negative limit', async () => {
      const result = await handler.execute(new ListSalesQuery({ limit: -10 }));
      expect(result.isFailure).toBe(true);
      expect(getErrorMessage(result)).toContain(
        'Limit must be an integer greater than or equal to 1',
      );
    });

    it('rejects non-integer limit', async () => {
      const result = await handler.execute(new ListSalesQuery({ limit: 10.5 }));
      expect(result.isFailure).toBe(true);
      expect(getErrorMessage(result)).toContain(
        'Limit must be an integer greater than or equal to 1',
      );
    });
  });

  describe('Filter Support', () => {
    it('filters sales by clientId', async () => {
      await saleRepo.save(createSaleWithProps({ id: 'sale_c1', clientId: 'client_alpha' }));
      await saleRepo.save(createSaleWithProps({ id: 'sale_c2', clientId: 'client_beta' }));
      await saleRepo.save(createSaleWithProps({ id: 'sale_c3', clientId: 'client_alpha' }));

      const result = await handler.execute(
        new ListSalesQuery({
          clientId: 'client_alpha',
        }),
      );

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      expect(data.total).toBe(2);
      expect(data.items.every((item) => item.clientId === 'client_alpha')).toBe(true);
    });

    it('filters sales by status', async () => {
      await saleRepo.save(createSaleWithProps({ id: 'sale_s1', status: SaleStatus.DRAFT }));
      await saleRepo.save(createSaleWithProps({ id: 'sale_s2', status: SaleStatus.CANCELLED }));

      const result = await handler.execute(
        new ListSalesQuery({
          status: 'CANCELLED',
        }),
      );

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      expect(data.total).toBe(1);
      expect(data.items[0]!.status).toBe('CANCELLED');
    });

    it('rejects invalid status filter value', async () => {
      const result = await handler.execute(
        new ListSalesQuery({
          status: 'NON_EXISTENT_STATUS',
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(getErrorMessage(result)).toContain('Invalid sale status');
      expect(result.getError()).toBeInstanceOf(InvalidSaleQueryException);
    });

    it('filters sales by sourceType', async () => {
      await saleRepo.save(createSaleWithProps({ id: 'sale_t1', sourceType: SaleSourceType.FOOD }));
      await saleRepo.save(
        createSaleWithProps({ id: 'sale_t2', sourceType: SaleSourceType.ROOM_RENTAL }),
      );

      const result = await handler.execute(
        new ListSalesQuery({
          sourceType: SaleSourceType.FOOD,
        }),
      );

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      expect(data.total).toBe(1);
      expect(data.items[0]!.source?.sourceType).toBe(SaleSourceType.FOOD);
    });

    it('filters sales by sourceReferenceId', async () => {
      await saleRepo.save(createSaleWithProps({ id: 'sale_r1', sourceId: 'order_ref_100' }));
      await saleRepo.save(createSaleWithProps({ id: 'sale_r2', sourceId: 'order_ref_200' }));

      const result = await handler.execute(
        new ListSalesQuery({
          sourceReferenceId: 'order_ref_100',
        }),
      );

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      expect(data.total).toBe(1);
      expect(data.items[0]!.source?.sourceId).toBe('order_ref_100');
    });

    it('filters sales by createdAt date range (fromDate and toDate)', async () => {
      await saleRepo.save(
        createSaleWithProps({
          id: 'sale_d1',
          timestamp: new Date('2026-10-01T00:00:00.000Z'),
        }),
      );
      await saleRepo.save(
        createSaleWithProps({
          id: 'sale_d2',
          timestamp: new Date('2026-10-05T00:00:00.000Z'),
        }),
      );
      await saleRepo.save(
        createSaleWithProps({
          id: 'sale_d3',
          timestamp: new Date('2026-10-10T00:00:00.000Z'),
        }),
      );

      const result = await handler.execute(
        new ListSalesQuery({
          fromDate: '2026-10-04T00:00:00.000Z',
          toDate: '2026-10-06T00:00:00.000Z',
        }),
      );

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();
      expect(data.total).toBe(1);
      expect(data.items[0]!.id).toBe('sale_d2');
    });

    it('rejects invalid fromDate string', async () => {
      const result = await handler.execute(
        new ListSalesQuery({
          fromDate: 'not-a-valid-date',
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(getErrorMessage(result)).toContain('Invalid fromDate format');
    });

    it('rejects invalid toDate string', async () => {
      const result = await handler.execute(
        new ListSalesQuery({
          toDate: 'not-a-valid-date',
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(getErrorMessage(result)).toContain('Invalid toDate format');
    });

    it('rejects when fromDate is after toDate', async () => {
      const result = await handler.execute(
        new ListSalesQuery({
          fromDate: '2026-10-10T00:00:00.000Z',
          toDate: '2026-10-01T00:00:00.000Z',
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(getErrorMessage(result)).toContain('cannot be after toDate');
    });

    it('filters sales by tenantId', async () => {
      await saleRepo.save(createSaleWithProps({ id: 'sale_t1', tenantId: 'tenant_A' }));
      await saleRepo.save(createSaleWithProps({ id: 'sale_t2', tenantId: 'tenant_B' }));

      const result = await handler.execute(
        new ListSalesQuery({
          tenantId: 'tenant_A',
        }),
      );

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().total).toBe(1);
      expect(result.getValue().items[0]!.tenantId).toBe('tenant_A');
    });
  });

  describe('Sorting Support', () => {
    beforeEach(async () => {
      await saleRepo.save(
        createSaleWithProps({
          id: 'sale_sort_1',
          unitPrice: 100,
          timestamp: new Date('2026-10-01T10:00:00.000Z'),
        }),
      );
      await saleRepo.save(
        createSaleWithProps({
          id: 'sale_sort_2',
          unitPrice: 30,
          timestamp: new Date('2026-10-02T10:00:00.000Z'),
        }),
      );
      await saleRepo.save(
        createSaleWithProps({
          id: 'sale_sort_3',
          unitPrice: 70,
          timestamp: new Date('2026-10-03T10:00:00.000Z'),
        }),
      );
    });

    it('sorts by createdAt desc by default', async () => {
      const result = await handler.execute(new ListSalesQuery({}));

      expect(result.isSuccess).toBe(true);
      const items = result.getValue().items;
      expect(items[0]!.id).toBe('sale_sort_3');
      expect(items[1]!.id).toBe('sale_sort_2');
      expect(items[2]!.id).toBe('sale_sort_1');
    });

    it('sorts by createdAt asc when requested', async () => {
      const result = await handler.execute(
        new ListSalesQuery({
          sortField: 'createdAt',
          sortDirection: 'asc',
        }),
      );

      expect(result.isSuccess).toBe(true);
      const items = result.getValue().items;
      expect(items[0]!.id).toBe('sale_sort_1');
      expect(items[1]!.id).toBe('sale_sort_2');
      expect(items[2]!.id).toBe('sale_sort_3');
    });

    it('sorts by total asc and desc', async () => {
      const descResult = await handler.execute(
        new ListSalesQuery({
          sortField: 'total',
          sortDirection: 'desc',
        }),
      );
      expect(descResult.isSuccess).toBe(true);
      expect(descResult.getValue().items.map((i) => i.id)).toEqual([
        'sale_sort_1', // $100
        'sale_sort_3', // $70
        'sale_sort_2', // $30
      ]);

      const ascResult = await handler.execute(
        new ListSalesQuery({
          sortField: 'total',
          sortDirection: 'asc',
        }),
      );
      expect(ascResult.isSuccess).toBe(true);
      expect(ascResult.getValue().items.map((i) => i.id)).toEqual([
        'sale_sort_2', // $30
        'sale_sort_3', // $70
        'sale_sort_1', // $100
      ]);
    });

    it('accepts totalAmount alias for total sorting', async () => {
      const result = await handler.execute(
        new ListSalesQuery({
          sortField: 'totalAmount',
          sortDirection: 'asc',
        }),
      );

      expect(result.isSuccess).toBe(true);
      expect(saleRepo.lastSort?.field).toBe('total');
      expect(result.getValue().items[0]!.id).toBe('sale_sort_2');
    });

    it('rejects invalid sort field', async () => {
      const result = await handler.execute(
        new ListSalesQuery({
          sortField: 'unauthorized_column',
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(getErrorMessage(result)).toContain('Invalid sort field');
      expect(result.getError()).toBeInstanceOf(InvalidSaleQueryException);
    });

    it('rejects invalid sort direction', async () => {
      const result = await handler.execute(
        new ListSalesQuery({
          sortField: 'createdAt',
          sortDirection: 'sideways' as unknown as 'asc',
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(getErrorMessage(result)).toContain('Invalid sort direction');
    });
  });

  describe('Empty Results Handling', () => {
    it('returns empty items array and zeroed pagination metadata when repository has no records', async () => {
      const result = await handler.execute(new ListSalesQuery({}));

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();

      expect(data.items).toEqual([]);
      expect(data.total).toBe(0);
      expect(data.page).toBe(1);
      expect(data.limit).toBe(20);
      expect(data.totalPages).toBe(0);
      expect(data.hasNextPage).toBe(false);
      expect(data.hasPreviousPage).toBe(false);
    });

    it('returns empty items array when no records match filter criteria', async () => {
      await saleRepo.save(createSaleWithProps({ id: 'sale_001', clientId: 'client_one' }));

      const result = await handler.execute(
        new ListSalesQuery({
          clientId: 'client_two_no_match',
        }),
      );

      expect(result.isSuccess).toBe(true);
      const data = result.getValue();

      expect(data.items).toEqual([]);
      expect(data.total).toBe(0);
      expect(data.totalPages).toBe(0);
    });
  });

  describe('Deterministic Secondary Ordering', () => {
    it('guarantees deterministic pagination ordering via secondary sort (id asc) when primary sort values are identical', async () => {
      const identicalTime = new Date('2026-10-01T12:00:00.000Z');
      const identicalTotal = 50;

      // Seed 6 sales with identical timestamp and identical total
      const ids = [
        'sale_zebra',
        'sale_apple',
        'sale_charlie',
        'sale_beta',
        'sale_delta',
        'sale_echo',
      ];
      for (const id of ids) {
        await saleRepo.save(
          createSaleWithProps({
            id,
            unitPrice: identicalTotal,
            timestamp: identicalTime,
          }),
        );
      }

      // Fetch page 1 (size 3)
      const page1Result = await handler.execute(
        new ListSalesQuery({
          page: 1,
          limit: 3,
          sortField: 'createdAt',
          sortDirection: 'desc',
        }),
      );

      // Fetch page 2 (size 3)
      const page2Result = await handler.execute(
        new ListSalesQuery({
          page: 2,
          limit: 3,
          sortField: 'createdAt',
          sortDirection: 'desc',
        }),
      );

      expect(page1Result.isSuccess).toBe(true);
      expect(page2Result.isSuccess).toBe(true);

      const page1Ids = page1Result.getValue().items.map((i) => i.id);
      const page2Ids = page2Result.getValue().items.map((i) => i.id);

      // Deterministic tie-breaking orders by id asc:
      // Alphabetical order: sale_apple, sale_beta, sale_charlie, sale_delta, sale_echo, sale_zebra
      expect(page1Ids).toEqual(['sale_apple', 'sale_beta', 'sale_charlie']);
      expect(page2Ids).toEqual(['sale_delta', 'sale_echo', 'sale_zebra']);

      // Ensure zero overlap between pages
      const overlap = page1Ids.filter((id) => page2Ids.includes(id));
      expect(overlap).toEqual([]);
    });
  });

  describe('Repository & Infrastructure Failure Handling', () => {
    it('propagates repository failure as SalesApplicationResult.fail', async () => {
      saleRepo.throwOnFind = new Error('Database connection timeout during sale query');

      const result = await handler.execute(new ListSalesQuery({}));

      expect(result.isFailure).toBe(true);
      expect(getErrorMessage(result)).toBe('Database connection timeout during sale query');
    });

    it('fails gracefully if repository does not implement findMany', async () => {
      const incompleteRepo: SaleRepositoryPort = {
        findById: jest.fn(),
        save: jest.fn(),
      };
      const incompleteHandler = new ListSalesHandler(incompleteRepo);

      const result = await incompleteHandler.execute(new ListSalesQuery({}));

      expect(result.isFailure).toBe(true);
      expect(getErrorMessage(result)).toContain(
        'SaleRepository does not implement findMany operation',
      );
    });

    it('fails if query or input is undefined', async () => {
      const result = await handler.execute(null as unknown as ListSalesQuery);
      expect(result.isFailure).toBe(true);
      expect(getErrorMessage(result)).toContain('Query and input cannot be null or undefined');
    });
  });
});
