import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ApplicationResult,
  SalesApplicationResult,
  SessionStatus,
  TreatmentSessionDTO,
} from '@kinergy-platform/core';
import { TherapistTreatmentCheckoutService } from '../application/therapist-treatment-checkout.service';
import { AuthenticatedUserContext } from '../../platform/identity/context';

describe('TherapistTreatmentCheckoutService Unit Tests', () => {
  let service: TherapistTreatmentCheckoutService;
  let mockGetSessionByIdHandler: { execute: jest.Mock };
  let mockCompleteSessionHandler: { execute: jest.Mock };
  let mockAppointmentLookup: { getAppointmentReference: jest.Mock; findById?: jest.Mock };
  let mockPrisma: {
    client: { findUnique: jest.Mock };
    sale: { findFirst: jest.Mock; findUnique: jest.Mock };
  };
  let mockCreateSaleHandler: { execute: jest.Mock };
  let mockFinalizeSaleHandler: { execute: jest.Mock };
  let mockCreatePaymentHandler: { execute: jest.Mock };
  let mockIssueReceiptHandler: { execute: jest.Mock };

  const mockSession: TreatmentSessionDTO = {
    id: 'sess_123',
    clientId: 'client_456',
    therapistId: 'therapist_789',
    appointmentId: 'appt_001',
    status: SessionStatus.IN_PROGRESS,
    notes: { subjective: 'Shoulder pain' },
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockAppointment = {
    id: 'appt_001',
    clientId: 'client_456',
    clientName: 'Carlos Rivera',
    serviceType: 'TREATMENT',
    status: 'CONFIRMED',
    startAt: new Date().toISOString(),
    endAt: new Date().toISOString(),
  };

  const mockUser = new AuthenticatedUserContext({
    userId: 'therapist_user_1',
    email: 'therapist@kinergy.test',
    status: 'ACTIVE',
    roles: ['Therapist'],
    permissions: ['sales.create', 'payments.create', 'receipts.read'],
  });

  beforeEach(() => {
    mockGetSessionByIdHandler = {
      execute: jest.fn().mockResolvedValue(ApplicationResult.ok(mockSession)),
    };
    mockCompleteSessionHandler = {
      execute: jest
        .fn()
        .mockResolvedValue(
          ApplicationResult.ok({ ...mockSession, status: SessionStatus.COMPLETED }),
        ),
    };
    mockAppointmentLookup = {
      findById: jest.fn().mockResolvedValue(mockAppointment),
      getAppointmentReference: jest.fn().mockResolvedValue({
        serviceType: 'TREATMENT',
        clientName: 'Carlos Rivera',
      }),
    };
    mockPrisma = {
      client: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'client_456',
          fullName: 'Carlos Rivera',
          firstName: 'Carlos',
          lastName: 'Rivera',
        }),
      },
      sale: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue({ id: 'sale_1', status: 'PAID' }),
      },
    };
    mockCreateSaleHandler = {
      execute: jest.fn().mockResolvedValue(
        SalesApplicationResult.ok({
          id: 'sale_1',
          clientId: 'client_456',
          status: 'DRAFT',
          totalAmount: 8500,
        }),
      ),
    };
    mockFinalizeSaleHandler = {
      execute: jest.fn().mockResolvedValue(
        SalesApplicationResult.ok({
          id: 'sale_1',
          status: 'PENDING_PAYMENT',
        }),
      ),
    };
    mockCreatePaymentHandler = {
      execute: jest.fn().mockResolvedValue(
        SalesApplicationResult.ok({
          id: 'pay_1',
          saleId: 'sale_1',
          status: 'COMPLETED',
          amount: 8500,
          method: 'CASH',
          paidAt: new Date().toISOString(),
        }),
      ),
    };
    mockIssueReceiptHandler = {
      execute: jest.fn().mockResolvedValue(
        SalesApplicationResult.ok({
          id: 'rcpt_1',
          receiptNumber: 'RCP-2026-0001',
          saleId: 'sale_1',
        }),
      ),
    };

    service = new TherapistTreatmentCheckoutService(
      mockPrisma as unknown as ConstructorParameters<typeof TherapistTreatmentCheckoutService>[0],
      mockGetSessionByIdHandler as unknown as ConstructorParameters<
        typeof TherapistTreatmentCheckoutService
      >[1],
      mockCompleteSessionHandler as unknown as ConstructorParameters<
        typeof TherapistTreatmentCheckoutService
      >[2],
      mockAppointmentLookup as unknown as ConstructorParameters<
        typeof TherapistTreatmentCheckoutService
      >[3],
      mockCreateSaleHandler as unknown as ConstructorParameters<
        typeof TherapistTreatmentCheckoutService
      >[4],
      mockFinalizeSaleHandler as unknown as ConstructorParameters<
        typeof TherapistTreatmentCheckoutService
      >[5],
      mockCreatePaymentHandler as unknown as ConstructorParameters<
        typeof TherapistTreatmentCheckoutService
      >[6],
      mockIssueReceiptHandler as unknown as ConstructorParameters<
        typeof TherapistTreatmentCheckoutService
      >[7],
    );
  });

  describe('getSessionBillingInfo', () => {
    it('resolves billing info with authoritative pricing ($85.00 for TREATMENT) and client full name', async () => {
      const billing = await service.getSessionBillingInfo('sess_123');

      expect(billing.sessionId).toBe('sess_123');
      expect(billing.clientFullName).toBe('Carlos Rivera');
      expect(billing.price.amount).toBe(85);
      expect(billing.price.currency).toBe('USD');
      expect(billing.price.formatted).toBe('$85.00');
      expect(billing.isAlreadyPaid).toBe(false);
      expect(billing.paymentStatus).toBe('UNPAID');
    });

    it('identifies already-paid session when an existing settled sale is present', async () => {
      mockPrisma.sale.findFirst.mockResolvedValueOnce({
        id: 'sale_existing',
        status: 'PAID',
        currency: 'USD',
        totalAmount: 8500,
        payments: [{ id: 'pay_existing', status: 'SETTLED', method: 'CASH' }],
        receipts: [{ id: 'rcpt_existing', receiptNumber: 'RCP-OLD-1' }],
      });

      const billing = await service.getSessionBillingInfo('sess_123');

      expect(billing.isAlreadyPaid).toBe(true);
      expect(billing.paymentStatus).toBe('PAID');
      expect(billing.existingSaleId).toBe('sale_existing');
      expect(billing.existingPaymentId).toBe('pay_existing');
      expect(billing.existingReceiptNumber).toBe('RCP-OLD-1');
    });

    it('throws NotFoundException when session does not exist', async () => {
      mockGetSessionByIdHandler.execute.mockResolvedValueOnce(
        ApplicationResult.fail('Session not found.'),
      );

      await expect(service.getSessionBillingInfo('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('Option A: Complete & Collect Payment (CASH or QR)', () => {
    it('successfully completes treatment session, creates 1 sale, 1 payment, and issues receipt', async () => {
      const result = await service.checkoutSession(
        'sess_123',
        {
          checkoutOption: 'COLLECT_PAYMENT',
          paymentMethod: 'CASH',
        },
        mockUser,
      );

      expect(result.success).toBe(true);
      expect(result.sessionStatus).toBe('COMPLETED');
      expect(result.saleStatus).toBe('PAID');
      expect(result.paymentMethod).toBe('CASH');
      expect(result.receiptNumber).toBe('RCP-2026-0001');

      // Verify orchestration sequence
      expect(mockCompleteSessionHandler.execute).toHaveBeenCalled();
      expect(mockCreateSaleHandler.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            clientId: 'client_456',
            source: expect.objectContaining({
              sourceType: 'KINESIOLOGY_SESSION',
              sourceId: 'sess_123',
            }),
          }),
        }),
      );
      expect(mockFinalizeSaleHandler.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({ saleId: 'sale_1' }),
        }),
      );
      expect(mockCreatePaymentHandler.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            saleId: 'sale_1',
            amount: 85,
            method: 'CASH',
          }),
        }),
      );
      expect(mockIssueReceiptHandler.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({ saleId: 'sale_1' }),
        }),
      );
    });

    it('supports QR payment method', async () => {
      mockCreatePaymentHandler.execute.mockResolvedValueOnce(
        SalesApplicationResult.ok({
          id: 'pay_qr',
          saleId: 'sale_1',
          status: 'COMPLETED',
          amount: 8500,
          method: 'QR',
        }),
      );

      const result = await service.checkoutSession(
        'sess_123',
        {
          checkoutOption: 'COLLECT_PAYMENT',
          paymentMethod: 'QR',
          paymentReference: 'QR-CONFIRM-999',
        },
        mockUser,
      );

      expect(result.success).toBe(true);
      expect(result.paymentMethod).toBe('QR');
      expect(mockCreatePaymentHandler.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            method: 'QR',
            reference: 'QR-CONFIRM-999',
          }),
        }),
      );
    });

    it('rejects re-collecting payment if session is already paid (409 Conflict)', async () => {
      mockPrisma.sale.findFirst.mockResolvedValueOnce({
        id: 'sale_already_paid',
        status: 'PAID',
        payments: [{ id: 'pay_1', status: 'SETTLED', method: 'CASH' }],
        receipts: [],
      });

      await expect(
        service.checkoutSession(
          'sess_123',
          { checkoutOption: 'COLLECT_PAYMENT', paymentMethod: 'CASH' },
          mockUser,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects checkout on a SCHEDULED session (must be IN_PROGRESS)', async () => {
      mockGetSessionByIdHandler.execute.mockResolvedValueOnce(
        ApplicationResult.ok({ ...mockSession, status: SessionStatus.SCHEDULED }),
      );

      await expect(
        service.checkoutSession(
          'sess_123',
          { checkoutOption: 'COLLECT_PAYMENT', paymentMethod: 'CASH' },
          mockUser,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('rejects unsupported payment method (400 Bad Request)', async () => {
      await expect(
        service.checkoutSession(
          'sess_123',
          {
            checkoutOption: 'COLLECT_PAYMENT',
            paymentMethod: 'CRYPTO' as unknown as 'CASH',
          },
          mockUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Option B: Complete Treatment (Already Paid)', () => {
    it('completes session without creating duplicate sale or charging client when paid', async () => {
      mockPrisma.sale.findFirst.mockResolvedValueOnce({
        id: 'sale_upfront',
        status: 'PAID',
        currency: 'USD',
        totalAmount: 8500,
        payments: [{ id: 'pay_upfront', status: 'SETTLED', method: 'CASH' }],
        receipts: [{ id: 'rcpt_upfront', receiptNumber: 'RCP-UPFRONT-01' }],
      });

      const result = await service.checkoutSession(
        'sess_123',
        { checkoutOption: 'ALREADY_PAID' },
        mockUser,
      );

      expect(result.success).toBe(true);
      expect(result.sessionStatus).toBe('COMPLETED');
      expect(result.saleId).toBe('sale_upfront');
      expect(result.paymentId).toBe('pay_upfront');
      expect(result.receiptNumber).toBe('RCP-UPFRONT-01');

      // Crucial: Must NOT create new sale or new payment!
      expect(mockCreateSaleHandler.execute).not.toHaveBeenCalled();
      expect(mockCreatePaymentHandler.execute).not.toHaveBeenCalled();
      expect(mockCompleteSessionHandler.execute).toHaveBeenCalled();
    });

    it('rejects Option B if no settled payment is found (422 Unprocessable Entity)', async () => {
      // Mock no existing sale/payment
      mockPrisma.sale.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.checkoutSession('sess_123', { checkoutOption: 'ALREADY_PAID' }, mockUser),
      ).rejects.toThrow(UnprocessableEntityException);

      expect(mockCompleteSessionHandler.execute).not.toHaveBeenCalled();
    });
  });
});
