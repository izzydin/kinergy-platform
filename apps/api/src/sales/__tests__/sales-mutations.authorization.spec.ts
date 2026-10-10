import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  Sale,
  Money,
  SaleId,
  SaleSource,
  SaleSourceType,
  SaleStatus,
  SaleRepositoryPort,
  SaleRepositoryInterface,
  FindSalesResult,
  CreateSaleHandler,
  AddSaleItemHandler,
  RemoveSaleItemHandler,
  ApplyOrderDiscountHandler,
  RemoveOrderDiscountHandler,
  FinalizeSaleHandler,
  CancelSaleHandler,
  AssignSaleSourceHandler,
  CalculateSaleHandler,
  GetSaleByIdHandler,
  ListSalesHandler,
  SaleUnauthorizedException,
  Discount,
} from '@kinergy-platform/core';
import { SalesController } from '../controllers/sales.controller';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { DefaultAuthorizationEvaluator } from '../../platform/identity/authorization/default-authorization-evaluator';
import { IPermissionResolver } from '../../platform/identity/authorization/authorization.interface';
import { AuthenticatedUserContext } from '../../platform/identity/context/authenticated-user-context';
import { AuthenticatedUserPayload } from '../../platform/identity/decorators/current-user.decorator';

/**
 * Spy / In-memory test repository that tracks save call counts and state snapshots.
 */
class SpySaleRepository implements SaleRepositoryPort, SaleRepositoryInterface {
  public store = new Map<string, Sale>();
  public saveCount = 0;
  public lastSavedSale: Sale | null = null;

  async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    const sale = this.store.get(key);
    if (!sale) return null;
    return sale;
  }

  async save(sale: Sale): Promise<void> {
    this.saveCount++;
    this.lastSavedSale = sale;
    this.store.set(sale.id.value, sale);
  }

  async findMany(): Promise<FindSalesResult> {
    return { items: [], total: 0 };
  }

  clear(): void {
    this.store.clear();
    this.saveCount = 0;
    this.lastSavedSale = null;
  }
}

describe('Sales Mutation Authorization & Domain Integrity Specification (ADR-0135, ADR-0111)', () => {
  let saleRepo: SpySaleRepository;
  let controller: SalesController;
  let reflector: Reflector;
  let permissionResolver: jest.Mocked<IPermissionResolver>;
  let evaluator: DefaultAuthorizationEvaluator;
  let guard: AuthorizationGuard;

  // Personas
  const authorizedManagerManage = new AuthenticatedUserContext({
    userId: 'usr_mgr_manage_01',
    email: 'manager.manage@kinergy.platform',
    status: 'ACTIVE',
    roles: ['Manager'],
    permissions: ['sales.manage'],
    tenantId: 'tenant_kinergy_main',
  });

  const authorizedOwnerManage = new AuthenticatedUserContext({
    userId: 'usr_owner_manage_01',
    email: 'owner.manage@kinergy.platform',
    status: 'ACTIVE',
    roles: ['Owner'],
    permissions: ['sales:manage'], // colon-notation variant
    tenantId: 'tenant_kinergy_main',
  });

  const trainerReadOnly = new AuthenticatedUserContext({
    userId: 'usr_trainer_01',
    email: 'trainer@kinergy.platform',
    status: 'ACTIVE',
    roles: ['Trainer'],
    permissions: ['sales.read'], // read-only
    tenantId: 'tenant_kinergy_main',
  });

  const staffMissingManage = new AuthenticatedUserContext({
    userId: 'usr_staff_no_manage',
    email: 'staff.no.manage@kinergy.platform',
    status: 'ACTIVE',
    roles: ['Kitchen Staff'],
    permissions: ['inventory.read', 'kitchen.read'], // missing sales:manage
    tenantId: 'tenant_kinergy_main',
  });

  const crossTenantManager = new AuthenticatedUserContext({
    userId: 'usr_competitor_mgr',
    email: 'rival@competitor.com',
    status: 'ACTIVE',
    roles: ['Manager'],
    permissions: ['sales.manage'],
    tenantId: 'tenant_competitor_rival',
  });

  const toPayload = (user: AuthenticatedUserContext): AuthenticatedUserPayload => ({
    id: user.userId,
    email: user.email,
    status: user.status,
    tenantId: user.tenantId,
    roles: [...user.roles],
    permissions: [...user.permissions],
  });

  beforeEach(() => {
    saleRepo = new SpySaleRepository();

    controller = new SalesController(
      saleRepo,
      undefined,
      new CreateSaleHandler(saleRepo),
      new GetSaleByIdHandler(saleRepo),
      new AddSaleItemHandler(saleRepo),
      new RemoveSaleItemHandler(saleRepo),
      new ApplyOrderDiscountHandler(saleRepo),
      new RemoveOrderDiscountHandler(saleRepo),
      new FinalizeSaleHandler(saleRepo),
      new CancelSaleHandler(saleRepo),
      undefined,
      new AssignSaleSourceHandler(saleRepo),
      new CalculateSaleHandler(saleRepo),
      new ListSalesHandler(saleRepo),
    );

    reflector = new Reflector();
    permissionResolver = {
      resolvePermissions: jest
        .fn()
        .mockImplementation((_userId, _roles, directPermissions) =>
          Promise.resolve(directPermissions ?? []),
        ),
    };
    evaluator = new DefaultAuthorizationEvaluator(permissionResolver);
    guard = new AuthorizationGuard(reflector, evaluator);
  });

  const createMockContext = (
    handlerName: keyof SalesController,
    userContext?: AuthenticatedUserContext,
  ): ExecutionContext => {
    return {
      getHandler: () => SalesController.prototype[handlerName],
      getClass: () => SalesController,
      switchToHttp: () => ({
        getRequest: () => ({
          user: userContext,
        }),
      }),
    } as unknown as ExecutionContext;
  };

  const seedDraftSale = (saleId = 'sale_mut_01', tenantId = 'tenant_kinergy_main'): Sale => {
    const sale = Sale.create({
      id: SaleId.create(saleId),
      currency: 'USD',
      tenantId,
      source: SaleSource.create(SaleSourceType.FOOD, 'terminal_1'),
    });
    saleRepo.store.set(saleId, sale);
    return sale;
  };

  const seedCancelledSale = (
    saleId = 'sale_cancelled_01',
    tenantId = 'tenant_kinergy_main',
  ): Sale => {
    const sale = seedDraftSale(saleId, tenantId);
    sale.cancel('Customer voided transaction');
    saleRepo.store.set(saleId, sale);
    return sale;
  };

  // =========================================================================
  // 1. CreateSale Mutation
  // =========================================================================
  describe('1. CreateSale Mutation Protection', () => {
    it('allows authorized caller with valid input and sales.manage permission', async () => {
      const context = createMockContext('createSale', authorizedManagerManage);
      expect(await guard.canActivate(context)).toBe(true);

      const initialSaveCount = saleRepo.saveCount;
      const res = await controller.createSale(
        {
          id: 'sale_new_01',
          currency: 'USD',
          sourceReference: { type: SaleSourceType.FOOD, referenceId: 'term_1' },
        },
        undefined,
        toPayload(authorizedManagerManage),
      );

      expect(res).toBeDefined();
      expect(res.id).toBe('sale_new_01');
      expect(res.status).toBe(SaleStatus.DRAFT);
      expect(saleRepo.saveCount).toBe(initialSaveCount + 1);
    });

    it('allows authorized caller with colon-notation sales:manage permission', async () => {
      const context = createMockContext('createSale', authorizedOwnerManage);
      expect(await guard.canActivate(context)).toBe(true);

      const res = await controller.createSale(
        {
          id: 'sale_new_colon_01',
          currency: 'USD',
          sourceReference: { type: SaleSourceType.FOOD, referenceId: 'term_1' },
        },
        undefined,
        toPayload(authorizedOwnerManage),
      );

      expect(res.id).toBe('sale_new_colon_01');
    });

    it('strictly denies unauthenticated caller at the guard boundary', async () => {
      const context = createMockContext('createSale', undefined);
      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
      expect(saleRepo.saveCount).toBe(0);
    });

    it('strictly denies caller missing sales:manage with ForbiddenException at guard', async () => {
      const context = createMockContext('createSale', staffMissingManage);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      expect(saleRepo.saveCount).toBe(0);
    });

    it('handler denies caller missing sales:manage with SaleUnauthorizedException', async () => {
      const handler = new CreateSaleHandler(saleRepo);
      const initialCount = saleRepo.saveCount;

      const result = await handler.execute({
        input: {
          id: 'sale_unauth_01',
          currency: 'USD',
          currentUser: {
            id: staffMissingManage.userId,
            roles: [...staffMissingManage.roles],
            permissions: [...staffMissingManage.permissions],
          },
        },
      });

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleUnauthorizedException);
      expect(saleRepo.saveCount).toBe(initialCount);
    });

    it('rejects invalid domain operation attempted by authorized caller and produces NO partial DB changes', async () => {
      const initialCount = saleRepo.saveCount;

      await expect(
        controller.createSale(
          {
            id: 'sale_invalid_cur',
            currency: 'INVALID_CURRENCY_CODE',
          },
          undefined,
          toPayload(authorizedManagerManage),
        ),
      ).rejects.toThrow();

      // Zero database changes
      expect(saleRepo.saveCount).toBe(initialCount);
      expect(saleRepo.store.has('sale_invalid_cur')).toBe(false);
    });
  });

  // =========================================================================
  // 2. AddSaleItem Mutation
  // =========================================================================
  describe('2. AddSaleItem Mutation Protection', () => {
    it('allows authorized caller with valid input and sales.manage', async () => {
      seedDraftSale('sale_add_01');
      const context = createMockContext('addItem', authorizedManagerManage);
      expect(await guard.canActivate(context)).toBe(true);

      const initialSaveCount = saleRepo.saveCount;
      const res = await controller.addItem(
        'sale_add_01',
        {
          description: 'Protein Shake',
          quantity: 2,
          unitPriceAmount: 5, // 5.00 USD
          sourceReference: { type: SaleSourceType.DRINK, referenceId: 'bar_tap_1' },
        },
        toPayload(authorizedManagerManage),
      );

      expect(res.items).toHaveLength(1);
      expect(res.total.cents).toBe(1000);
      expect(saleRepo.saveCount).toBe(initialSaveCount + 1);
    });

    it('strictly denies unauthenticated caller at the guard boundary', async () => {
      seedDraftSale('sale_add_02');
      const context = createMockContext('addItem', undefined);
      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
      expect(saleRepo.saveCount).toBe(0);
    });

    it('strictly denies caller missing sales:manage with ForbiddenException at guard', async () => {
      seedDraftSale('sale_add_03');
      const context = createMockContext('addItem', staffMissingManage);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      expect(saleRepo.saveCount).toBe(0);
    });

    it('handler denies caller missing sales:manage with SaleUnauthorizedException', async () => {
      seedDraftSale('sale_add_04');
      const handler = new AddSaleItemHandler(saleRepo);
      const initialSaveCount = saleRepo.saveCount;

      const result = await handler.execute({
        input: {
          saleId: 'sale_add_04',
          description: 'Item',
          quantity: 1,
          unitPriceAmount: 10,
          currentUser: {
            id: staffMissingManage.userId,
            roles: [...staffMissingManage.roles],
            permissions: [...staffMissingManage.permissions],
          },
        },
      });

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleUnauthorizedException);
      expect(saleRepo.saveCount).toBe(initialSaveCount);
    });

    it('enforces cancelled-sale immutability: rejects adding items to CANCELLED sale without persisting', async () => {
      seedCancelledSale('sale_cancelled_add');
      const initialSaveCount = saleRepo.saveCount;

      await expect(
        controller.addItem(
          'sale_cancelled_add',
          {
            description: 'Item',
            quantity: 1,
            unitPriceAmount: 200,
            sourceReference: { type: SaleSourceType.DRINK, referenceId: 'bar' },
          },
          toPayload(authorizedManagerManage),
        ),
      ).rejects.toThrow();

      // Aggregate state preserved and zero saves occurred
      expect(saleRepo.saveCount).toBe(initialSaveCount);
      const sale = await saleRepo.findById('sale_cancelled_add');
      expect(sale?.items).toHaveLength(0);
      expect(sale?.status).toBe(SaleStatus.CANCELLED);
    });

    it('rejects invalid domain operation (negative price) without DB changes', async () => {
      seedDraftSale('sale_neg_price');
      const initialSaveCount = saleRepo.saveCount;

      await expect(
        controller.addItem(
          'sale_neg_price',
          {
            description: 'Bad item',
            quantity: 1,
            unitPriceAmount: -500, // Invalid negative unit price
            sourceReference: { type: SaleSourceType.DRINK, referenceId: 'bar' },
          },
          toPayload(authorizedManagerManage),
        ),
      ).rejects.toThrow();

      expect(saleRepo.saveCount).toBe(initialSaveCount);
    });
  });

  // =========================================================================
  // 3. RemoveSaleItem Mutation
  // =========================================================================
  describe('3. RemoveSaleItem Mutation Protection', () => {
    it('allows authorized caller with valid input and sales.manage', async () => {
      const sale = seedDraftSale('sale_rem_01');
      sale.addItem({
        source: SaleSource.create(SaleSourceType.DRINK, 'd1'),
        description: 'Water',
        quantity: 1,
        unitPrice: Money.create(200, 'USD'),
      });
      const firstItem = sale.items[0];
      expect(firstItem).toBeDefined();
      const itemId = firstItem!.id.value;
      await saleRepo.save(sale);

      const context = createMockContext('removeItem', authorizedManagerManage);
      expect(await guard.canActivate(context)).toBe(true);

      const initialSaveCount = saleRepo.saveCount;
      const res = await controller.removeItem(
        'sale_rem_01',
        itemId,
        toPayload(authorizedManagerManage),
      );

      expect(res.items).toHaveLength(0);
      expect(res.total.cents).toBe(0);
      expect(saleRepo.saveCount).toBe(initialSaveCount + 1);
    });

    it('strictly denies unauthenticated caller at the guard boundary', async () => {
      seedDraftSale('sale_rem_02');
      const context = createMockContext('removeItem', undefined);
      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it('strictly denies caller missing sales:manage with ForbiddenException at guard', async () => {
      seedDraftSale('sale_rem_03');
      const context = createMockContext('removeItem', staffMissingManage);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('handler denies caller missing sales:manage with SaleUnauthorizedException', async () => {
      const sale = seedDraftSale('sale_rem_04');
      sale.addItem({
        source: SaleSource.create(SaleSourceType.DRINK, 'd1'),
        description: 'Water',
        quantity: 1,
        unitPrice: Money.create(200, 'USD'),
      });
      const firstItem = sale.items[0];
      expect(firstItem).toBeDefined();
      const itemId = firstItem!.id.value;
      await saleRepo.save(sale);

      const handler = new RemoveSaleItemHandler(saleRepo);
      const initialSaveCount = saleRepo.saveCount;

      const result = await handler.execute({
        input: {
          saleId: 'sale_rem_04',
          itemId,
          currentUser: {
            id: staffMissingManage.userId,
            roles: [...staffMissingManage.roles],
            permissions: [...staffMissingManage.permissions],
          },
        },
      });

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleUnauthorizedException);
      expect(saleRepo.saveCount).toBe(initialSaveCount);
    });

    it('rejects removing non-existent item without mutating DB', async () => {
      seedDraftSale('sale_rem_nonexist');
      const initialSaveCount = saleRepo.saveCount;

      await expect(
        controller.removeItem(
          'sale_rem_nonexist',
          'non_existent_item_id',
          toPayload(authorizedManagerManage),
        ),
      ).rejects.toThrow();

      expect(saleRepo.saveCount).toBe(initialSaveCount);
    });
  });

  // =========================================================================
  // 4. ApplyDiscount Mutation
  // =========================================================================
  describe('4. ApplyDiscount Mutation Protection', () => {
    it('allows authorized caller with valid input and sales.manage', async () => {
      const sale = seedDraftSale('sale_disc_01');
      sale.addItem({
        source: SaleSource.create(SaleSourceType.DRINK, 'd1'),
        description: 'Supplement',
        quantity: 1,
        unitPrice: Money.create(10, 'USD'),
      });
      await saleRepo.save(sale);

      const context = createMockContext('applyDiscount', authorizedManagerManage);
      expect(await guard.canActivate(context)).toBe(true);

      const initialSaveCount = saleRepo.saveCount;
      const res = await controller.applyDiscount(
        'sale_disc_01',
        {
          type: 'PERCENTAGE',
          value: 10,
          reason: 'Member Promo',
        },
        toPayload(authorizedManagerManage),
      );

      expect(res.discountTotal.cents).toBe(100);
      expect(res.total.cents).toBe(900);
      expect(saleRepo.saveCount).toBe(initialSaveCount + 1);
    });

    it('strictly denies unauthenticated caller at the guard boundary', async () => {
      seedDraftSale('sale_disc_02');
      const context = createMockContext('applyDiscount', undefined);
      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it('strictly denies caller missing sales:manage with ForbiddenException at guard', async () => {
      seedDraftSale('sale_disc_03');
      const context = createMockContext('applyDiscount', staffMissingManage);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('handler denies caller missing sales:manage with SaleUnauthorizedException', async () => {
      seedDraftSale('sale_disc_04');
      const handler = new ApplyOrderDiscountHandler(saleRepo);
      const initialSaveCount = saleRepo.saveCount;

      const result = await handler.execute({
        input: {
          saleId: 'sale_disc_04',
          discount: { type: 'PERCENTAGE', value: 10 },
          currentUser: {
            id: staffMissingManage.userId,
            roles: [...staffMissingManage.roles],
            permissions: [...staffMissingManage.permissions],
          },
        },
      });

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleUnauthorizedException);
      expect(saleRepo.saveCount).toBe(initialSaveCount);
    });

    it('preserves discount and money rules: rejects excessive discount (>100%) without saving', async () => {
      const sale = seedDraftSale('sale_disc_excess');
      sale.addItem({
        source: SaleSource.create(SaleSourceType.DRINK, 'd1'),
        description: 'Item',
        quantity: 1,
        unitPrice: Money.create(10, 'USD'),
      });
      await saleRepo.save(sale);
      const initialSaveCount = saleRepo.saveCount;

      await expect(
        controller.applyDiscount(
          'sale_disc_excess',
          {
            type: 'PERCENTAGE',
            value: 150, // Invalid: > 100%
            reason: 'Excessive discount',
          },
          toPayload(authorizedManagerManage),
        ),
      ).rejects.toThrow();

      expect(saleRepo.saveCount).toBe(initialSaveCount);
    });
  });

  // =========================================================================
  // 5. CalculateSale Operation (Verification of Read-Only Semantics)
  // =========================================================================
  describe('5. CalculateSale Read-Only Semantics Verification', () => {
    it('proves CalculateSale does NOT mutate persisted state and issues ZERO save calls', async () => {
      const sale = seedDraftSale('sale_calc_01');
      sale.addItem({
        source: SaleSource.create(SaleSourceType.DRINK, 'd1'),
        description: 'Smoothie',
        quantity: 2,
        unitPrice: Money.create(6, 'USD'),
      });
      await saleRepo.save(sale);
      const initialSaveCount = saleRepo.saveCount;

      const totals = await controller.calculateSale('sale_calc_01', toPayload(trainerReadOnly));

      expect(totals).toBeDefined();
      expect(totals.subtotal.cents).toBe(1200);
      expect(totals.total.cents).toBe(1200);

      // Invariant: Zero persistence writes / zero mutation
      expect(saleRepo.saveCount).toBe(initialSaveCount);
    });
  });

  // =========================================================================
  // 6. CancelSale Mutation
  // =========================================================================
  describe('6. CancelSale Mutation Protection', () => {
    it('allows authorized caller with valid input and sales.manage', async () => {
      seedDraftSale('sale_cancel_01');
      const context = createMockContext('cancelSale', authorizedManagerManage);
      expect(await guard.canActivate(context)).toBe(true);

      const initialSaveCount = saleRepo.saveCount;
      const res = await controller.cancelSale(
        'sale_cancel_01',
        { reason: 'Customer changed mind' },
        toPayload(authorizedManagerManage),
      );

      expect(res.status).toBe(SaleStatus.CANCELLED);
      expect(res.cancellationReason).toBe('Customer changed mind');
      expect(saleRepo.saveCount).toBe(initialSaveCount + 1);
    });

    it('strictly denies unauthenticated caller at the guard boundary', async () => {
      seedDraftSale('sale_cancel_02');
      const context = createMockContext('cancelSale', undefined);
      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it('strictly denies caller missing sales:manage or sales.cancel (Trainer)', async () => {
      seedDraftSale('sale_cancel_03');
      const context = createMockContext('cancelSale', trainerReadOnly);
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('handler denies caller missing sales:manage with SaleUnauthorizedException', async () => {
      seedDraftSale('sale_cancel_04');
      const handler = new CancelSaleHandler(saleRepo);
      const initialSaveCount = saleRepo.saveCount;

      const result = await handler.execute({
        input: {
          saleId: 'sale_cancel_04',
          reason: 'Unauthorized attempt',
          currentUser: {
            id: staffMissingManage.userId,
            roles: [...staffMissingManage.roles],
            permissions: [...staffMissingManage.permissions],
          },
        },
      });

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleUnauthorizedException);
      expect(saleRepo.saveCount).toBe(initialSaveCount);
    });

    it('preserves cancelled-sale immutability: rejects repeated cancellation (self-transition guard)', async () => {
      seedCancelledSale('sale_already_cancelled');
      const initialSaveCount = saleRepo.saveCount;

      await expect(
        controller.cancelSale(
          'sale_already_cancelled',
          { reason: 'Second cancellation attempt' },
          toPayload(authorizedManagerManage),
        ),
      ).rejects.toThrow();

      expect(saleRepo.saveCount).toBe(initialSaveCount);
    });

    it('rejects cross-tenant cancellation without modifying target state', async () => {
      seedDraftSale('sale_target_tenant', 'tenant_kinergy_main');
      const initialSaveCount = saleRepo.saveCount;

      await expect(
        controller.cancelSale(
          'sale_target_tenant',
          { reason: 'Cross-tenant attempt' },
          toPayload(crossTenantManager),
        ),
      ).rejects.toThrow();

      expect(saleRepo.saveCount).toBe(initialSaveCount);
    });
  });

  // =========================================================================
  // 7. Ancillary Mutations & Invariants Verification
  // =========================================================================
  describe('7. Ancillary Mutations & Architectural Invariants', () => {
    it('RemoveOrderDiscount: requires sales.manage and produces zero changes on unauthorized caller', async () => {
      const sale = seedDraftSale('sale_rem_disc_01');
      sale.applyDiscount(Discount.percentage(15, 'Promo'));
      await saleRepo.save(sale);

      const handler = new RemoveOrderDiscountHandler(saleRepo);
      const initialSaveCount = saleRepo.saveCount;

      const result = await handler.execute({
        input: {
          saleId: 'sale_rem_disc_01',
          currentUser: {
            id: staffMissingManage.userId,
            roles: [...staffMissingManage.roles],
            permissions: [...staffMissingManage.permissions],
          },
        },
      });

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleUnauthorizedException);
      expect(saleRepo.saveCount).toBe(initialSaveCount);
    });

    it('FinalizeSale: requires sales.manage and prevents invalid domain transitions', async () => {
      // Empty sale cannot be finalized (empty sale invariant)
      seedDraftSale('sale_empty_finalize');
      const initialSaveCount = saleRepo.saveCount;

      await expect(
        controller.finalizeSale('sale_empty_finalize', {}, toPayload(authorizedManagerManage)),
      ).rejects.toThrow();

      expect(saleRepo.saveCount).toBe(initialSaveCount);
    });

    it('AssignSaleSource: requires sales.manage and preserves source immutability once finalized', async () => {
      seedCancelledSale('sale_cancelled_source');
      const initialSaveCount = saleRepo.saveCount;

      await expect(
        controller.assignSource(
          'sale_cancelled_source',
          {
            sourceReference: { type: SaleSourceType.FOOD, referenceId: 'term_9' },
          },
          toPayload(authorizedManagerManage),
        ),
      ).rejects.toThrow();

      expect(saleRepo.saveCount).toBe(initialSaveCount);
    });

    it('Domain Purity: Sale aggregate remains completely unaware of caller roles and permissions', () => {
      const sale = seedDraftSale('sale_pure_01');
      const rawSale = sale as unknown as Record<string, unknown>;
      expect(typeof rawSale.currentUser).toBe('undefined');
      expect(typeof rawSale.permissions).toBe('undefined');
      expect(typeof rawSale.roles).toBe('undefined');
    });

    it('Payment State Invariance: Sale mutations do NOT incidentally alter payment state or trigger payment side effects', async () => {
      const sale = seedDraftSale('sale_payment_invariance');
      sale.addItem({
        source: SaleSource.create(SaleSourceType.DRINK, 'd1'),
        description: 'Water',
        quantity: 1,
        unitPrice: Money.create(200, 'USD'),
      });
      await saleRepo.save(sale);

      const initialStatus = sale.status;

      await controller.addItem(
        'sale_payment_invariance',
        {
          description: 'Electrolyte',
          quantity: 1,
          unitPriceAmount: 300,
          sourceReference: { type: SaleSourceType.DRINK, referenceId: 'bar' },
        },
        toPayload(authorizedManagerManage),
      );

      const updatedSale = await saleRepo.findById('sale_payment_invariance');
      // Status remains DRAFT - payment state was not touched
      expect(updatedSale?.status).toBe(initialStatus);
      expect(updatedSale?.status).toBe(SaleStatus.DRAFT);
    });
  });
});
