import {
  Prisma,
  PrismaClient,
  Sale as PrismaSaleModel,
  SaleItem as PrismaSaleItemModel,
  SaleStatus as PrismaSaleStatus,
} from '@prisma/client';
import { Sale } from '../../../../domain/sale.aggregate';
import { SaleItem } from '../../../../domain/entities/sale-item.entity';
import { SaleId } from '../../../../domain/value-objects/sale-id.vo';
import { SaleItemId } from '../../../../domain/value-objects/sale-item-id.vo';
import { Money } from '../../../../domain/value-objects/money.vo';
import { DiscountType } from '../../../../domain/enums/discount-type.enum';
import { SourceReference } from '../../../../domain/value-objects/source-reference.vo';
import { SaleSource } from '../../../../domain/value-objects/sale-source.vo';
import { SourceType } from '../../../../domain/enums/source-type.enum';
import { SaleSourceType } from '../../../../domain/enums/sale-source-type.enum';
import { SaleStatus } from '../../../../domain/enums/sale-status.enum';
import { InvalidSaleStateException } from '../../../../domain/exceptions/invalid-sale-state.exception';
import { PrismaSaleRepository } from '../repositories/prisma-sale.repository';
import { PrismaSaleItemMapper } from '../mappers/prisma-sale-item.mapper';
import { DeterministicClock } from '../../../../domain/shared/clock';
import * as fs from 'fs';
import * as path from 'path';

/**
 * In-Memory PostgreSQL Simulation Engine for Prisma Sale Queries and Mutations.
 * Provides high-fidelity verification of SQL filtering, ordering, pagination,
 * transactions, and aggregate reconstruction.
 */
class InMemoryPrismaDatabase {
  public sales = new Map<string, PrismaSaleModel>();
  public items = new Map<string, PrismaSaleItemModel>();

  public clear(): void {
    this.sales.clear();
    this.items.clear();
  }

  public seedSale(
    saleData: Partial<PrismaSaleModel> & { id: string },
    lineItemsData: Array<Partial<PrismaSaleItemModel> & { id: string }> = [],
  ): void {
    const defaultSale: PrismaSaleModel = {
      id: saleData.id,
      tenantId: saleData.tenantId ?? 'tenant-alpha',
      clientId: saleData.clientId ?? 'client-101',
      status: saleData.status ?? ('COMPLETED' as PrismaSaleStatus),
      currency: saleData.currency ?? 'USD',
      sourceType: saleData.sourceType ?? 'FOOD',
      sourceId: saleData.sourceId ?? 'src-001',
      sourceCode: saleData.sourceCode ?? null,
      subtotalAmount: saleData.subtotalAmount ?? new Prisma.Decimal('100.00'),
      discountTotalAmount: saleData.discountTotalAmount ?? new Prisma.Decimal('0.00'),
      totalAmount: saleData.totalAmount ?? new Prisma.Decimal('100.00'),
      orderDiscountType: saleData.orderDiscountType ?? null,
      orderDiscountValue: saleData.orderDiscountValue ?? null,
      orderDiscountReason: saleData.orderDiscountReason ?? null,
      cancellationReason: saleData.cancellationReason ?? null,
      cancelledAt: saleData.cancelledAt ?? null,
      completedAt: saleData.completedAt ?? null,
      refundedAt: saleData.refundedAt ?? null,
      version: saleData.version ?? 1,
      createdAt: saleData.createdAt ?? new Date('2026-10-01T12:00:00.000Z'),
      updatedAt: saleData.updatedAt ?? new Date('2026-10-01T12:00:00.000Z'),
    };

    this.sales.set(defaultSale.id, defaultSale);

    for (const itemData of lineItemsData) {
      const defaultItem: PrismaSaleItemModel = {
        id: itemData.id,
        saleId: itemData.saleId ?? defaultSale.id,
        sourceType: itemData.sourceType ?? 'FOOD',
        sourceId: itemData.sourceId ?? 'item-src-01',
        sourceCode: itemData.sourceCode ?? null,
        description: itemData.description ?? 'Test Item',
        skuOrCode: itemData.skuOrCode ?? null,
        quantity: itemData.quantity ?? new Prisma.Decimal('1.000'),
        unitPriceAmount: itemData.unitPriceAmount ?? new Prisma.Decimal('100.00'),
        unitPriceCurrency: itemData.unitPriceCurrency ?? defaultSale.currency,
        subtotalAmount: itemData.subtotalAmount ?? new Prisma.Decimal('100.00'),
        discountTotalAmount: itemData.discountTotalAmount ?? new Prisma.Decimal('0.00'),
        totalAmount: itemData.totalAmount ?? new Prisma.Decimal('100.00'),
        discountType: itemData.discountType ?? null,
        discountValue: itemData.discountValue ?? null,
        discountReason: itemData.discountReason ?? null,
        createdAt: itemData.createdAt ?? defaultSale.createdAt,
        updatedAt: itemData.updatedAt ?? defaultSale.updatedAt,
      };
      this.items.set(defaultItem.id, defaultItem);
    }
  }

  public createClient = (): PrismaClient => {
    const executeWhere = (record: PrismaSaleModel, where?: Prisma.SaleWhereInput): boolean => {
      if (!where) return true;

      if (where.tenantId && record.tenantId !== where.tenantId) {
        return false;
      }
      if (where.clientId && record.clientId !== where.clientId) {
        return false;
      }
      if (where.status && record.status !== where.status) {
        return false;
      }
      if (where.sourceType && record.sourceType !== where.sourceType) {
        return false;
      }
      if (where.sourceId && record.sourceId !== where.sourceId) {
        return false;
      }
      if (where.createdAt) {
        const createdAtFilter = where.createdAt as { gte?: Date; lte?: Date };
        if (createdAtFilter.gte && record.createdAt < createdAtFilter.gte) {
          return false;
        }
        if (createdAtFilter.lte && record.createdAt > createdAtFilter.lte) {
          return false;
        }
      }
      if (where.OR && Array.isArray(where.OR)) {
        const orConditions = where.OR as Array<Record<string, unknown>>;
        const matchesAny = orConditions.some((cond) => {
          if (cond.id) {
            const idCond = cond.id as { contains?: string; mode?: string } | string;
            if (typeof idCond === 'string') {
              return record.id === idCond;
            }
            if (idCond.contains) {
              return record.id.toLowerCase().includes(idCond.contains.toLowerCase());
            }
          }
          if (cond.sourceCode) {
            const scCond = cond.sourceCode as { contains?: string; mode?: string } | string;
            if (typeof scCond === 'string') {
              return record.sourceCode === scCond;
            }
            if (scCond.contains) {
              return (
                record.sourceCode?.toLowerCase().includes(scCond.contains.toLowerCase()) ?? false
              );
            }
          }
          if (cond.sourceId) {
            const siCond = cond.sourceId as { contains?: string; mode?: string } | string;
            if (typeof siCond === 'string') {
              return record.sourceId === siCond;
            }
            if (siCond.contains) {
              return record.sourceId.toLowerCase().includes(siCond.contains.toLowerCase()) ?? false;
            }
          }
          return false;
        });
        if (!matchesAny) {
          return false;
        }
      }

      return true;
    };

    const clientObj: Record<string, unknown> = {};

    clientObj.$transaction = jest.fn(
      async <T>(cb: (tx: PrismaClient) => Promise<T>): Promise<T> => {
        return cb(clientObj as unknown as PrismaClient);
      },
    );

    clientObj.sale = {
      findUnique: jest.fn(
        async ({ where, include }: { where: { id: string }; include?: { items?: boolean } }) => {
          const record = this.sales.get(where.id);
          if (!record) return null;
          if (include?.items) {
            const items = Array.from(this.items.values()).filter(
              (item) => item.saleId === record.id,
            );
            return { ...record, items };
          }
          return { ...record };
        },
      ),
      findFirst: jest.fn(
        async ({
          where,
          include,
        }: {
          where: Prisma.SaleWhereInput;
          include?: { items?: boolean };
        }) => {
          for (const record of this.sales.values()) {
            if (executeWhere(record, where)) {
              if (include?.items) {
                const items = Array.from(this.items.values()).filter(
                  (item) => item.saleId === record.id,
                );
                return { ...record, items };
              }
              return { ...record };
            }
          }
          return null;
        },
      ),
      findMany: jest.fn(
        async (args: {
          where?: Prisma.SaleWhereInput;
          orderBy?: Prisma.SaleOrderByWithRelationInput[];
          skip?: number;
          take?: number;
          cursor?: { id: string };
          include?: { _count?: { select?: { items?: boolean } } };
        }) => {
          const matched = Array.from(this.sales.values()).filter((r) =>
            executeWhere(r, args.where),
          );

          // Sorting simulation
          if (args.orderBy && args.orderBy.length > 0) {
            matched.sort((a, b) => {
              for (const order of args.orderBy!) {
                if (order.totalAmount) {
                  const diff = a.totalAmount.toNumber() - b.totalAmount.toNumber();
                  if (diff !== 0) {
                    return order.totalAmount === 'asc' ? diff : -diff;
                  }
                } else if (order.status) {
                  const diff = a.status.localeCompare(b.status);
                  if (diff !== 0) {
                    return order.status === 'asc' ? diff : -diff;
                  }
                } else if (order.createdAt) {
                  const diff = a.createdAt.getTime() - b.createdAt.getTime();
                  if (diff !== 0) {
                    return order.createdAt === 'asc' ? diff : -diff;
                  }
                } else if (order.id) {
                  const diff = a.id.localeCompare(b.id);
                  if (diff !== 0) {
                    return order.id === 'asc' ? diff : -diff;
                  }
                }
              }
              return 0;
            });
          }

          // Cursor and Pagination simulation
          let startIndex = 0;
          if (args.cursor) {
            const cursorIndex = matched.findIndex((r) => r.id === args.cursor!.id);
            if (cursorIndex !== -1) {
              startIndex = cursorIndex + (args.skip ?? 0);
            }
          } else if (args.skip) {
            startIndex = args.skip;
          }

          const endIndex = args.take !== undefined ? startIndex + args.take : undefined;
          const sliced = matched.slice(startIndex, endIndex);

          return sliced.map((record) => {
            const itemCount = Array.from(this.items.values()).filter(
              (item) => item.saleId === record.id,
            ).length;
            return {
              ...record,
              _count: { items: itemCount },
            };
          });
        },
      ),
      count: jest.fn(async (args: { where?: Prisma.SaleWhereInput }) => {
        return Array.from(this.sales.values()).filter((r) => executeWhere(r, args?.where)).length;
      }),
      upsert: jest.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { id: string };
          create: PrismaSaleModel & { items?: { create: PrismaSaleItemModel[] } };
          update: PrismaSaleModel;
        }) => {
          const existing = this.sales.get(where.id);
          if (existing) {
            const updated = {
              ...existing,
              ...update,
              updatedAt: new Date(),
            };
            this.sales.set(where.id, updated);
            return updated;
          } else {
            const rest = { ...create };
            delete (rest as { items?: unknown }).items;
            const created = {
              ...rest,
              createdAt: new Date(),
              updatedAt: new Date(),
            } as PrismaSaleModel;
            this.sales.set(where.id, created);
            return created;
          }
        },
      ),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; version: number };
          data: Partial<PrismaSaleModel>;
        }) => {
          const existing = this.sales.get(where.id);
          if (!existing || existing.version !== where.version) {
            return { count: 0 };
          }
          const updated = {
            ...existing,
            ...data,
            updatedAt: new Date(),
          } as PrismaSaleModel;
          this.sales.set(where.id, updated);
          return { count: 1 };
        },
      ),
    };

    clientObj.saleItem = {
      deleteMany: jest.fn(
        async ({ where }: { where: { saleId: string; id?: { notIn?: string[] } } }) => {
          let count = 0;
          for (const [id, item] of this.items.entries()) {
            if (item.saleId === where.saleId) {
              if (where.id?.notIn && !where.id.notIn.includes(id)) {
                this.items.delete(id);
                count++;
              } else if (!where.id) {
                this.items.delete(id);
                count++;
              }
            }
          }
          return { count };
        },
      ),
      upsert: jest.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { id: string };
          create: PrismaSaleItemModel;
          update: PrismaSaleItemModel;
        }) => {
          const existing = this.items.get(where.id);
          const data = existing ? { ...existing, ...update } : { ...create };
          this.items.set(where.id, data);
          return data;
        },
      ),
    };

    return clientObj as unknown as PrismaClient;
  };
}

describe('PrismaSaleRepository Query & Persistence Hardening (Integration)', () => {
  const clock = new DeterministicClock(new Date('2026-10-14T10:00:00.000Z'));
  let db: InMemoryPrismaDatabase;
  let prismaClient: PrismaClient;
  let repo: PrismaSaleRepository;

  beforeEach(() => {
    db = new InMemoryPrismaDatabase();
    prismaClient = db.createClient();
    repo = new PrismaSaleRepository(prismaClient);
  });

  // ==========================================================================
  // 1. Every Individual Filter Criteria Verification
  // ==========================================================================
  describe('1. Individual Filter Criteria', () => {
    beforeEach(() => {
      // Seed diverse sales dataset
      db.seedSale({
        id: 'sale-001',
        tenantId: 'tenant-A',
        clientId: 'client-1',
        status: 'COMPLETED' as PrismaSaleStatus,
        sourceType: 'FOOD',
        sourceId: 'src-order-1',
        sourceCode: 'CODE-FOOD-01',
        createdAt: new Date('2026-10-01T10:00:00.000Z'),
        totalAmount: new Prisma.Decimal('50.00'),
      });
      db.seedSale({
        id: 'sale-002',
        tenantId: 'tenant-A',
        clientId: 'client-2',
        status: 'PENDING_PAYMENT' as PrismaSaleStatus,
        sourceType: 'KINESIOLOGY_SESSION',
        sourceId: 'src-session-2',
        sourceCode: 'ORD-KLIN-02',
        createdAt: new Date('2026-10-05T10:00:00.000Z'),
        totalAmount: new Prisma.Decimal('150.00'),
      });
      db.seedSale({
        id: 'sale-003',
        tenantId: 'tenant-B',
        clientId: 'client-1',
        status: 'DRAFT' as PrismaSaleStatus,
        sourceType: 'GYM_MEMBERSHIP',
        sourceId: 'src-membership-3',
        sourceCode: 'GYM-REG-03',
        createdAt: new Date('2026-10-10T10:00:00.000Z'),
        totalAmount: new Prisma.Decimal('75.00'),
      });
      db.seedSale({
        id: 'sale-004',
        tenantId: 'tenant-A',
        clientId: 'client-3',
        status: 'CANCELLED' as PrismaSaleStatus,
        sourceType: 'ROOM_RENTAL',
        sourceId: 'src-room-4',
        sourceCode: 'RENT-04',
        createdAt: new Date('2026-10-12T10:00:00.000Z'),
        totalAmount: new Prisma.Decimal('200.00'),
      });
    });

    it('filters strictly by tenantId', async () => {
      const result = await repo.findMany(
        { tenantId: 'tenant-A' },
        { page: 1, limit: 10 },
        { field: 'createdAt', direction: 'desc' },
      );
      expect(result.total).toBe(3);
      expect(result.items.every((i) => i.tenantId === 'tenant-A')).toBe(true);
      expect(result.items.map((i) => i.id)).toEqual(['sale-004', 'sale-002', 'sale-001']);
    });

    it('filters strictly by clientId', async () => {
      const result = await repo.findMany(
        { clientId: 'client-1' },
        { page: 1, limit: 10 },
        { field: 'createdAt', direction: 'desc' },
      );
      expect(result.total).toBe(2);
      expect(result.items.map((i) => i.id)).toEqual(['sale-003', 'sale-001']);
    });

    it('filters strictly by status', async () => {
      const result = await repo.findMany(
        { status: SaleStatus.PENDING_PAYMENT },
        { page: 1, limit: 10 },
        { field: 'createdAt', direction: 'desc' },
      );
      expect(result.total).toBe(1);
      expect(result.items[0]?.id).toBe('sale-002');
      expect(result.items[0]?.status).toBe('PENDING_PAYMENT');
    });

    it('filters strictly by sourceType', async () => {
      const result = await repo.findMany(
        { sourceType: 'KINESIOLOGY_SESSION' },
        { page: 1, limit: 10 },
        { field: 'createdAt', direction: 'desc' },
      );
      expect(result.total).toBe(1);
      expect(result.items[0]?.id).toBe('sale-002');
      expect(result.items[0]?.source?.sourceType).toBe('KINESIOLOGY_SESSION');
    });

    it('filters strictly by sourceReferenceId', async () => {
      const result = await repo.findMany(
        { sourceReferenceId: 'src-membership-3' },
        { page: 1, limit: 10 },
        { field: 'createdAt', direction: 'desc' },
      );
      expect(result.total).toBe(1);
      expect(result.items[0]?.id).toBe('sale-003');
      expect(result.items[0]?.source?.sourceId).toBe('src-membership-3');
    });

    it('filters by fromDate (inclusive gte)', async () => {
      const result = await repo.findMany(
        { fromDate: new Date('2026-10-05T10:00:00.000Z') },
        { page: 1, limit: 10 },
        { field: 'createdAt', direction: 'desc' },
      );
      expect(result.total).toBe(3);
      expect(result.items.map((i) => i.id)).toEqual(['sale-004', 'sale-003', 'sale-002']);
    });

    it('filters by toDate (inclusive lte)', async () => {
      const result = await repo.findMany(
        { toDate: new Date('2026-10-05T10:00:00.000Z') },
        { page: 1, limit: 10 },
        { field: 'createdAt', direction: 'desc' },
      );
      expect(result.total).toBe(2);
      expect(result.items.map((i) => i.id)).toEqual(['sale-002', 'sale-001']);
    });

    it('filters by search term matching id', async () => {
      const result = await repo.findMany(
        { search: 'sale-002' },
        { page: 1, limit: 10 },
        { field: 'createdAt', direction: 'desc' },
      );
      expect(result.total).toBe(1);
      expect(result.items[0]?.id).toBe('sale-002');
    });

    it('filters by search term matching sourceCode (case-insensitive substring)', async () => {
      const result = await repo.findMany(
        { search: 'food-01' },
        { page: 1, limit: 10 },
        { field: 'createdAt', direction: 'desc' },
      );
      expect(result.total).toBe(1);
      expect(result.items[0]?.id).toBe('sale-001');
    });

    it('filters by search term matching sourceId (case-insensitive substring)', async () => {
      const result = await repo.findMany(
        { search: 'room-4' },
        { page: 1, limit: 10 },
        { field: 'createdAt', direction: 'desc' },
      );
      expect(result.total).toBe(1);
      expect(result.items[0]?.id).toBe('sale-004');
    });

    it('ignores whitespace-only search term', async () => {
      const result = await repo.findMany(
        { search: '   ' },
        { page: 1, limit: 10 },
        { field: 'createdAt', direction: 'desc' },
      );
      expect(result.total).toBe(4);
    });
  });

  // ==========================================================================
  // 2. Combined Query Criteria
  // ==========================================================================
  describe('2. Combined Query Criteria', () => {
    beforeEach(() => {
      db.seedSale({
        id: 'sale-101',
        tenantId: 'tenant-main',
        clientId: 'client-alice',
        status: 'PAID' as PrismaSaleStatus,
        sourceType: 'FOOD',
        sourceId: 'order-101',
        sourceCode: 'CAFE-101',
        createdAt: new Date('2026-10-02T08:00:00.000Z'),
        totalAmount: new Prisma.Decimal('45.00'),
      });
      db.seedSale({
        id: 'sale-102',
        tenantId: 'tenant-main',
        clientId: 'client-alice',
        status: 'PAID' as PrismaSaleStatus,
        sourceType: 'DRINK',
        sourceId: 'order-102',
        sourceCode: 'CAFE-102',
        createdAt: new Date('2026-10-03T09:00:00.000Z'),
        totalAmount: new Prisma.Decimal('15.00'),
      });
      db.seedSale({
        id: 'sale-103',
        tenantId: 'tenant-main',
        clientId: 'client-bob',
        status: 'PAID' as PrismaSaleStatus,
        sourceType: 'FOOD',
        sourceId: 'order-103',
        sourceCode: 'CAFE-103',
        createdAt: new Date('2026-10-03T10:00:00.000Z'),
        totalAmount: new Prisma.Decimal('55.00'),
      });
    });

    it('combines tenant, client, status, sourceType, date range, and search', async () => {
      const result = await repo.findMany(
        {
          tenantId: 'tenant-main',
          clientId: 'client-alice',
          status: SaleStatus.PAID,
          sourceType: 'FOOD',
          fromDate: new Date('2026-10-01T00:00:00.000Z'),
          toDate: new Date('2026-10-05T00:00:00.000Z'),
          search: '101',
        },
        { page: 1, limit: 10 },
        { field: 'createdAt', direction: 'desc' },
      );

      expect(result.total).toBe(1);
      expect(result.items[0]?.id).toBe('sale-101');
      expect(result.items[0]?.clientId).toBe('client-alice');
      expect(result.items[0]?.source?.sourceCode).toBe('CAFE-101');
    });

    it('returns empty result when combined criteria do not intersect', async () => {
      const result = await repo.findMany(
        {
          tenantId: 'tenant-main',
          clientId: 'client-bob',
          sourceType: 'DRINK', // Bob only has FOOD
        },
        { page: 1, limit: 10 },
        { field: 'createdAt', direction: 'desc' },
      );

      expect(result.total).toBe(0);
      expect(result.items).toHaveLength(0);
    });
  });

  // ==========================================================================
  // 3. Sorting & Deterministic Tie-Breaker
  // ==========================================================================
  describe('3. Sorting & Deterministic Secondary Ordering', () => {
    beforeEach(() => {
      db.seedSale({
        id: 'sale-A',
        totalAmount: new Prisma.Decimal('100.00'),
        status: 'PENDING_PAYMENT' as PrismaSaleStatus,
        createdAt: new Date('2026-10-01T10:00:00.000Z'),
      });
      db.seedSale({
        id: 'sale-B',
        totalAmount: new Prisma.Decimal('50.00'),
        status: 'COMPLETED' as PrismaSaleStatus,
        createdAt: new Date('2026-10-02T10:00:00.000Z'),
      });
      db.seedSale({
        id: 'sale-C',
        totalAmount: new Prisma.Decimal('100.00'), // Identical total as sale-A
        status: 'COMPLETED' as PrismaSaleStatus,
        createdAt: new Date('2026-10-03T10:00:00.000Z'),
      });
    });

    it('sorts by total desc with secondary deterministic id asc tie-breaker', async () => {
      const result = await repo.findMany(
        {},
        { page: 1, limit: 10 },
        { field: 'total', direction: 'desc' },
      );

      expect(result.items.map((i) => i.id)).toEqual(['sale-A', 'sale-C', 'sale-B']);
    });

    it('sorts by total asc with secondary deterministic id asc tie-breaker', async () => {
      const result = await repo.findMany(
        {},
        { page: 1, limit: 10 },
        { field: 'total', direction: 'asc' },
      );

      expect(result.items.map((i) => i.id)).toEqual(['sale-B', 'sale-A', 'sale-C']);
    });

    it('sorts by createdAt desc by default', async () => {
      const result = await repo.findMany(
        {},
        { page: 1, limit: 10 },
        { field: 'createdAt', direction: 'desc' },
      );

      expect(result.items.map((i) => i.id)).toEqual(['sale-C', 'sale-B', 'sale-A']);
    });

    it('sorts by createdAt asc', async () => {
      const result = await repo.findMany(
        {},
        { page: 1, limit: 10 },
        { field: 'createdAt', direction: 'asc' },
      );

      expect(result.items.map((i) => i.id)).toEqual(['sale-A', 'sale-B', 'sale-C']);
    });

    it('sorts by status asc with deterministic id tie-breaker', async () => {
      const result = await repo.findMany(
        {},
        { page: 1, limit: 10 },
        { field: 'status', direction: 'asc' },
      );

      // 'COMPLETED' comes before 'PENDING_PAYMENT'. Between sale-B and sale-C: 'sale-B' < 'sale-C'
      expect(result.items.map((i) => i.id)).toEqual(['sale-B', 'sale-C', 'sale-A']);
    });
  });

  // ==========================================================================
  // 4. Pagination & Boundaries
  // ==========================================================================
  describe('4. Pagination Mechanics & Edge Cases', () => {
    beforeEach(() => {
      for (let i = 1; i <= 25; i++) {
        const padded = String(i).padStart(3, '0');
        db.seedSale({
          id: `sale-${padded}`,
          createdAt: new Date(`2026-10-${String(i % 28 || 1).padStart(2, '0')}T10:00:00.000Z`),
          totalAmount: new Prisma.Decimal(`${i * 10}.00`),
        });
      }
    });

    it('paginates accurately across multiple pages without duplicate rows', async () => {
      const page1 = await repo.findMany(
        {},
        { page: 1, limit: 10 },
        { field: 'total', direction: 'asc' },
      );
      const page2 = await repo.findMany(
        {},
        { page: 2, limit: 10 },
        { field: 'total', direction: 'asc' },
      );
      const page3 = await repo.findMany(
        {},
        { page: 3, limit: 10 },
        { field: 'total', direction: 'asc' },
      );

      expect(page1.items).toHaveLength(10);
      expect(page2.items).toHaveLength(10);
      expect(page3.items).toHaveLength(5);
      expect(page1.total).toBe(25);
      expect(page2.total).toBe(25);
      expect(page3.total).toBe(25);

      const allIds = [
        ...page1.items.map((i) => i.id),
        ...page2.items.map((i) => i.id),
        ...page3.items.map((i) => i.id),
      ];
      expect(new Set(allIds).size).toBe(25);
    });

    it('handles requests beyond the last page returning empty items and correct total', async () => {
      const result = await repo.findMany(
        {},
        { page: 10, limit: 10 },
        { field: 'createdAt', direction: 'desc' },
      );

      expect(result.total).toBe(25);
      expect(result.items).toHaveLength(0);
    });

    it('sanitizes non-positive page and limit parameters defensively', async () => {
      const result = await repo.findMany(
        {},
        { page: -5, limit: 0 },
        { field: 'createdAt', direction: 'desc' },
      );

      // Should clamp page to 1 and limit to at least 1
      expect(result.items.length).toBeGreaterThanOrEqual(1);
      expect(result.total).toBe(25);
    });

    it('supports cursor-based pagination skipping the cursor row', async () => {
      const result = await repo.findMany(
        {},
        { page: 1, limit: 3, cursor: 'sale-005' },
        { field: 'total', direction: 'asc' },
      );

      expect(result.items).toHaveLength(3);
      expect(result.items[0]?.id).toBe('sale-006');
      expect(result.items[1]?.id).toBe('sale-007');
      expect(result.items[2]?.id).toBe('sale-008');
    });
  });

  // ==========================================================================
  // 5. Aggregate Reconstruction & Source Representation
  // ==========================================================================
  describe('5. Aggregate Reconstruction & Monetary Precision', () => {
    it('accurately reconstitutes a Sale aggregate with owned line items via findById', async () => {
      db.seedSale(
        {
          id: 'sale-recon-01',
          tenantId: 'tenant-xyz',
          clientId: 'client-99',
          status: 'PAID' as PrismaSaleStatus,
          currency: 'USD',
          sourceType: 'KINESIOLOGY_SESSION',
          sourceId: 'sess-888',
          sourceCode: 'ORD-KLIN-888',
          subtotalAmount: new Prisma.Decimal('120.00'),
          discountTotalAmount: new Prisma.Decimal('20.00'),
          totalAmount: new Prisma.Decimal('100.00'),
          orderDiscountType: 'FIXED',
          orderDiscountValue: new Prisma.Decimal('20.00'),
          orderDiscountReason: 'First session discount',
          completedAt: new Date('2026-10-14T09:00:00.000Z'),
          version: 2,
        },
        [
          {
            id: 'item-01',
            saleId: 'sale-recon-01',
            sourceType: 'KINESIOLOGY_SESSION',
            sourceId: 'sess-888',
            description: 'Kinesiology Consultation (60 min)',
            quantity: new Prisma.Decimal('1.000'),
            unitPriceAmount: new Prisma.Decimal('120.00'),
            subtotalAmount: new Prisma.Decimal('120.00'),
            discountTotalAmount: new Prisma.Decimal('0.00'),
            totalAmount: new Prisma.Decimal('120.00'),
          },
        ],
      );

      const aggregate = await repo.findById('sale-recon-01');

      expect(aggregate).not.toBeNull();
      expect(aggregate!.id.value).toBe('sale-recon-01');
      expect(aggregate!.tenantId).toBe('tenant-xyz');
      expect(aggregate!.clientId).toBe('client-99');
      expect(aggregate!.status).toBe(SaleStatus.PAID);
      expect(aggregate!.version).toBe(2);
      expect(aggregate!.completedAt).toEqual(new Date('2026-10-14T09:00:00.000Z'));

      // Monetary Value Objects preservation
      expect(aggregate!.subtotal.amount).toBe(120.0);
      expect(aggregate!.discountTotal.amount).toBe(20.0);
      expect(aggregate!.total.amount).toBe(100.0);
      expect(aggregate!.total.currency).toBe('USD');

      // Order Discount reconstitution
      expect(aggregate!.orderDiscount).not.toBeNull();
      expect(aggregate!.orderDiscount!.type).toBe(DiscountType.FIXED);
      expect(aggregate!.orderDiscount!.value).toBe(20.0);
      expect(aggregate!.orderDiscount!.reason).toBe('First session discount');

      // Owned line items reconstitution
      expect(aggregate!.items).toHaveLength(1);
      const lineItem = aggregate!.items[0]!;
      expect(lineItem.id.value).toBe('item-01');
      expect(lineItem.description).toBe('Kinesiology Consultation (60 min)');
      expect(lineItem.unitPrice.amount).toBe(120.0);
      expect(lineItem.quantity).toBe(1);

      // Source representation consistency
      expect(aggregate!.source.sourceType).toBe('KINESIOLOGY_SESSION');
      expect(aggregate!.source.sourceId).toBe('sess-888');
    });

    it('preserves fractional monetary cents without floating point distortion', async () => {
      db.seedSale({
        id: 'sale-precision-01',
        currency: 'USD',
        subtotalAmount: new Prisma.Decimal('10.55'),
        discountTotalAmount: new Prisma.Decimal('0.05'),
        totalAmount: new Prisma.Decimal('10.50'),
      });

      const result = await repo.findMany(
        { search: 'sale-precision-01' },
        { page: 1, limit: 1 },
        { field: 'createdAt', direction: 'desc' },
      );

      expect(result.items).toHaveLength(1);
      const summary = result.items[0]!;
      expect(summary.subtotalAmount).toBe(10.55);
      expect(summary.discountTotalAmount).toBe(0.05);
      expect(summary.totalAmount).toBe(10.5);
      expect(summary.subtotal.amount).toBe(10.55);
      expect(summary.discountTotal.amount).toBe(0.05);
      expect(summary.total.amount).toBe(10.5);
    });

    it('preserves multi-currency ISO-4217 specifications (e.g. CAD, EUR)', async () => {
      db.seedSale(
        {
          id: 'sale-cad-01',
          currency: 'CAD',
          status: 'COMPLETED' as PrismaSaleStatus,
          completedAt: new Date('2026-10-14T09:30:00.000Z'),
          subtotalAmount: new Prisma.Decimal('85.00'),
          discountTotalAmount: new Prisma.Decimal('0.00'),
          totalAmount: new Prisma.Decimal('85.00'),
        },
        [
          {
            id: 'item-cad-01',
            saleId: 'sale-cad-01',
            sourceType: 'FOOD',
            sourceId: 'src-cad-01',
            description: 'Item in Canadian Dollars',
            quantity: new Prisma.Decimal('1.000'),
            unitPriceAmount: new Prisma.Decimal('85.00'),
            unitPriceCurrency: 'CAD',
            subtotalAmount: new Prisma.Decimal('85.00'),
            discountTotalAmount: new Prisma.Decimal('0.00'),
            totalAmount: new Prisma.Decimal('85.00'),
          },
        ],
      );

      const aggregate = await repo.findById('sale-cad-01');
      expect(aggregate).not.toBeNull();
      expect(aggregate!.currency).toBe('CAD');
      expect(aggregate!.total.currency).toBe('CAD');
      expect(aggregate!.total.amount).toBe(85.0);
    });
  });

  // ==========================================================================
  // 6. Cross-Sale Item Association Protection
  // ==========================================================================
  describe('6. Cross-Sale Item Association Isolation', () => {
    it('strictly prohibits persisting a SaleItem belonging to Sale A under parent Sale B', () => {
      const source = SaleSource.create(SaleSourceType.FOOD, 'snack-01');
      const itemBelongingToSaleA = SaleItem.reconstitute({
        id: SaleItemId.create('item-A'),
        saleId: SaleId.create('sale-parent-A'),
        source,
        description: 'Protein Bar',
        quantity: 1,
        unitPrice: Money.create(5.0, 'USD'),
      });

      expect(() => {
        PrismaSaleItemMapper.toPersistence(itemBelongingToSaleA, 'foreign-sale-parent-B', 'USD');
      }).toThrow(InvalidSaleStateException);

      expect(() => {
        PrismaSaleItemMapper.toPersistence(itemBelongingToSaleA, 'foreign-sale-parent-B', 'USD');
      }).toThrow(/Cross-Sale persistence is strictly prohibited/);
    });

    it('prohibits persisting a detached SaleItem without parent saleId', () => {
      const source = SaleSource.create(SaleSourceType.FOOD, 'snack-02');
      const detachedItem = SaleItem.create({
        id: SaleItemId.create('item-detached'),
        source,
        description: 'Apple',
        quantity: 1,
        unitPrice: Money.create(2.0, 'USD'),
      });

      expect(() => {
        PrismaSaleItemMapper.toPersistence(detachedItem, undefined, 'USD');
      }).toThrow(InvalidSaleStateException);
      expect(() => {
        PrismaSaleItemMapper.toPersistence(detachedItem, undefined, 'USD');
      }).toThrow(/without parent saleId/);
    });

    it('prohibits persisting a SaleItem with currency mismatching parent sale', () => {
      const source = SaleSource.create(SaleSourceType.FOOD, 'snack-03');
      const itemCad = SaleItem.create({
        id: SaleItemId.create('item-cad'),
        saleId: SaleId.create('sale-usd-01'),
        source,
        description: 'Item CAD',
        quantity: 1,
        unitPrice: Money.create(10.0, 'CAD'),
      });

      expect(() => {
        PrismaSaleItemMapper.toPersistence(itemCad, 'sale-usd-01', 'USD');
      }).toThrow(InvalidSaleStateException);
      expect(() => {
        PrismaSaleItemMapper.toPersistence(itemCad, 'sale-usd-01', 'USD');
      }).toThrow(/Currency mismatch/);
    });
  });

  // ==========================================================================
  // 7. Transactional Boundaries & Rollback Mechanics
  // ==========================================================================
  describe('7. Transactional Boundaries', () => {
    it('executes atomic operations within withTransaction wrapper', async () => {
      const source = SourceReference.create({
        sourceType: SourceType.INVENTORY_ITEM,
        sourceId: 'inv-item-777',
      });
      const sale = Sale.create({ id: SaleId.create('sale-atomic-01'), source }, clock);
      sale.addItem(
        {
          source,
          description: 'Bandage',
          quantity: 2,
          unitPrice: Money.create(15.0, 'USD'),
        },
        clock,
      );

      const result = await repo.withTransaction(async (txRepo) => {
        await txRepo.save(sale);
        return 'COMMITTED';
      });

      expect(result).toBe('COMMITTED');
      const persisted = await repo.findById('sale-atomic-01');
      expect(persisted).not.toBeNull();
      expect(persisted!.items).toHaveLength(1);
    });
  });

  // ==========================================================================
  // 8. ADR-0131 Database Index & Relation-Loading Compliance Verification
  // ==========================================================================
  describe('8. Database Index & Query Pattern Verification', () => {
    it('confirms @@index definitions in schema.prisma align with ADR-0131 without speculative bloat', () => {
      const schemaPath = path.resolve(process.cwd(), 'prisma/schema.prisma');
      const schema = fs.readFileSync(schemaPath, 'utf-8');

      const saleMatch = schema.match(/model\s+Sale\s*\{[\s\S]*?\n\}/);
      expect(saleMatch).not.toBeNull();
      const saleModel = saleMatch![0];

      // Mandatory justified composite and chronological indexes
      expect(saleModel).toContain('@@index([tenantId])');
      expect(saleModel).toContain('@@index([clientId, createdAt(sort: Desc)])');
      expect(saleModel).toContain('@@index([status, createdAt(sort: Desc)])');
      expect(saleModel).toContain('@@index([createdAt(sort: Desc)])');
      expect(saleModel).toContain('@@index([tenantId, sourceType, sourceId])');
      expect(saleModel).toContain('@@index([sourceType, sourceId])');

      // Rejection of speculative single-column indexes
      expect(saleModel).not.toMatch(/@@index\(\[clientId\]\)/);
      expect(saleModel).not.toMatch(/@@index\(\[status\]\)/);
      expect(saleModel).not.toMatch(/@@index\(\[totalAmount\]\)/);
      expect(saleModel).not.toMatch(/@@index\(\[sourceType\]\)/);
      expect(saleModel).not.toMatch(/@@index\(\[sourceId\]\)/);
    });

    it('verifies findMany executes lean scalar query with _count avoiding relation bloat', async () => {
      const findManySpy = jest.spyOn(prismaClient.sale, 'findMany');

      await repo.findMany(
        { tenantId: 'tenant-test' },
        { page: 1, limit: 5 },
        { field: 'createdAt', direction: 'desc' },
      );

      expect(findManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            _count: {
              select: { items: true },
            },
          },
        }),
      );

      // Verify that relations (items array, payments, receipts) were NOT requested in findMany
      const callArgs = findManySpy.mock.calls[0]![0] as Record<string, unknown>;
      const include = callArgs.include as Record<string, unknown> | undefined;
      expect(include?.payments).toBeUndefined();
      expect(include?.receipts).toBeUndefined();
      expect(include?.items).toBeUndefined(); // only _count is selected
    });
  });
});
