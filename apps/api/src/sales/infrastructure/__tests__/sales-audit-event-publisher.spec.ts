import { SalesAuditEventPublisher } from '../sales-audit-event-publisher';
import {
  SalePaidEvent,
  Sale,
  SaleId,
  SaleSource,
  SaleSourceType,
  Membership,
  MembershipId,
  MembershipPeriod,
  MembershipStatus,
  MembershipRepository,
  SaleRepositoryPort,
  ActivateOrRenewMembershipHandler,
} from '@kinergy-platform/core';

describe('SalesAuditEventPublisher — Post-Payment Fulfillment Invariants (ADR-0139)', () => {
  let publisher: SalesAuditEventPublisher;
  let mockSaleRepo: jest.Mocked<SaleRepositoryPort>;
  let mockMembershipRepo: jest.Mocked<MembershipRepository>;
  let mockActivateOrRenewHandler: jest.Mocked<ActivateOrRenewMembershipHandler>;

  const baseDate = new Date('2026-10-28T10:00:00.000Z');

  beforeEach(() => {
    mockSaleRepo = {
      findById: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<SaleRepositoryPort>;

    mockMembershipRepo = {
      findById: jest.fn(),
      save: jest.fn(),
      findByClientId: jest.fn(),
    } as unknown as jest.Mocked<MembershipRepository>;

    mockActivateOrRenewHandler = {
      activateOrRenew: jest.fn(),
    } as unknown as jest.Mocked<ActivateOrRenewMembershipHandler>;

    publisher = new SalesAuditEventPublisher(
      undefined, // auditPublisher
      undefined, // contextAccessor
      mockActivateOrRenewHandler,
      mockSaleRepo,
      mockMembershipRepo,
    );
  });

  it('does NOT trigger renewal or extension when sale pays for an already ACTIVE pre-enrolled membership', async () => {
    const existingMembershipId = 'mem_pre_enrolled_001';
    const activeMembership = Membership.reconstitute({
      id: MembershipId.create(existingMembershipId),
      version: 1,
      status: MembershipStatus.ACTIVE,
      clientId: 'client_elena_001',
      planId: 'plan_monthly_10',
      period: MembershipPeriod.create(
        new Date('2026-10-28T10:00:00.000Z'),
        new Date('2026-11-27T10:00:00.000Z'),
      ),
      createdAt: baseDate,
      updatedAt: baseDate,
    });

    mockMembershipRepo.findById.mockResolvedValue(activeMembership);

    const sale = Sale.create({
      id: SaleId.create('sale_001'),
      clientId: 'client_elena_001',
      currency: 'USD',
      source: new SaleSource({
        type: SaleSourceType.GYM_MEMBERSHIP,
        referenceId: 'plan_monthly_10',
        sourceCode: existingMembershipId,
      }),
    });

    mockSaleRepo.findById.mockResolvedValue(sale);

    const paidEvent = new SalePaidEvent('sale_001', 1, {
      saleId: 'sale_001',
      totalAmount: 79.99,
      currency: 'USD',
    });

    await publisher.publish([paidEvent]);

    // Verified: does NOT call activateOrRenew, preserving the 30-day agreement boundary
    expect(mockActivateOrRenewHandler.activateOrRenew).not.toHaveBeenCalled();
    expect(mockMembershipRepo.save).not.toHaveBeenCalled();
  });

  it('activates PENDING membership when payment settles for a pre-enrolled agreement', async () => {
    const existingMembershipId = 'mem_pending_001';
    const pendingMembership = Membership.reconstitute({
      id: MembershipId.create(existingMembershipId),
      version: 1,
      status: MembershipStatus.PENDING,
      clientId: 'client_elena_001',
      planId: 'plan_monthly_10',
      period: MembershipPeriod.create(
        new Date('2026-10-28T10:00:00.000Z'),
        new Date('2026-11-27T10:00:00.000Z'),
      ),
      createdAt: baseDate,
      updatedAt: baseDate,
    });

    mockMembershipRepo.findById.mockResolvedValue(pendingMembership);

    const sale = Sale.create({
      id: SaleId.create('sale_002'),
      clientId: 'client_elena_001',
      currency: 'USD',
      source: new SaleSource({
        type: SaleSourceType.GYM_MEMBERSHIP,
        referenceId: 'plan_monthly_10',
        sourceCode: existingMembershipId,
      }),
    });

    mockSaleRepo.findById.mockResolvedValue(sale);

    const paidEvent = new SalePaidEvent('sale_002', 1, {
      saleId: 'sale_002',
      totalAmount: 79.99,
      currency: 'USD',
    });

    await publisher.publish([paidEvent]);

    expect(pendingMembership.status).toBe(MembershipStatus.ACTIVE);
    expect(mockMembershipRepo.save).toHaveBeenCalledWith(pendingMembership);
    expect(mockActivateOrRenewHandler.activateOrRenew).not.toHaveBeenCalled();
  });

  it('delegates to activateOrRenew when sale originates from POS terminal without pre-existing membership agreement', async () => {
    mockMembershipRepo.findById.mockResolvedValue(null);

    const sale = Sale.create({
      id: SaleId.create('sale_pos_001'),
      clientId: 'client_pos_001',
      currency: 'USD',
      source: new SaleSource({
        type: SaleSourceType.GYM_MEMBERSHIP,
        referenceId: 'plan_monthly_10',
        sourceCode: 'pos_checkout_terminal',
      }),
    });

    mockSaleRepo.findById.mockResolvedValue(sale);

    const paidEvent = new SalePaidEvent('sale_pos_001', 1, {
      saleId: 'sale_pos_001',
      totalAmount: 79.99,
      currency: 'USD',
    });

    await publisher.publish([paidEvent]);

    expect(mockActivateOrRenewHandler.activateOrRenew).toHaveBeenCalledWith({
      clientId: 'client_pos_001',
      planId: 'plan_monthly_10',
      paymentRef: 'sale_pos_001',
    });
  });
});
