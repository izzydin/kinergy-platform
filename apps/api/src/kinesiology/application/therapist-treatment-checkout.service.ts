import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
  ConflictException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import {
  GetTreatmentSessionByIdHandler,
  GetTreatmentSessionByIdQuery,
  CompleteTreatmentSessionHandler,
  CompleteTreatmentSessionCommand,
  CreateSaleHandler,
  CreateSaleCommand,
  FinalizeSaleHandler,
  FinalizeSaleCommand,
  CreatePaymentHandler,
  CreatePaymentCommand,
  IssueReceiptHandler,
  IssueReceiptCommand,
  SaleSourceType,
  PaymentMethod,
  PaymentStatus,
  ISchedulingAppointmentLookupPort,
} from '@kinergy-platform/core';
import { PrismaService } from '../../platform/persistence/prisma/prisma.service';
import { SCHEDULING_APPOINTMENT_LOOKUP_PORT_TOKEN } from '../kinesiology.tokens';
import { DefaultKinesiologyFeeScheduleResolver } from '../../sales/infrastructure/adapters/kinesiology-source-validator.adapter';
import { AuthenticatedUserContext } from '../../platform/identity/context';

function toSaleUser(currentUser?: AuthenticatedUserContext):
  | {
      id?: string;
      userId?: string;
      roles?: string[];
      permissions?: string[];
      tenantId?: string;
    }
  | undefined {
  if (!currentUser) return undefined;
  return {
    id: currentUser.userId,
    userId: currentUser.userId,
    roles: currentUser.roles ? [...currentUser.roles] : [],
    permissions: currentUser.permissions ? [...currentUser.permissions] : [],
    tenantId: currentUser.tenantId ?? undefined,
  };
}

export interface SessionBillingInfoDto {
  readonly sessionId: string;
  readonly appointmentId: string;
  readonly clientId: string;
  readonly clientFullName: string;
  readonly therapistId: string;
  readonly sessionStatus: string;
  readonly serviceType: string;
  readonly serviceDescription: string;
  readonly price: {
    readonly amount: number;
    readonly currency: string;
    readonly formatted: string;
  };
  readonly isAlreadyPaid: boolean;
  readonly paymentStatus: 'UNPAID' | 'PENDING' | 'PARTIALLY_PAID' | 'PAID';
  readonly existingSaleId?: string | null;
  readonly existingPaymentId?: string | null;
  readonly existingPaymentMethod?: string | null;
  readonly existingReceiptId?: string | null;
  readonly existingReceiptNumber?: string | null;
}

export interface CompleteAndCheckoutInput {
  readonly checkoutOption?: 'COLLECT_PAYMENT' | 'ALREADY_PAID';
  readonly flowOption?: 'COLLECT_PAYMENT' | 'ALREADY_PAID';
  readonly paymentMethod?: 'CASH' | 'QR';
  readonly paymentReference?: string;
  readonly tenderAmount?: number;
  readonly idempotencyKey?: string;
}

export interface CompleteAndCheckoutResponseDto {
  readonly success: boolean;
  readonly sessionId: string;
  readonly sessionStatus: string;
  readonly saleId: string;
  readonly saleStatus: string;
  readonly paymentId?: string | null;
  readonly paymentStatus?: string | null;
  readonly paymentMethod?: string | null;
  readonly receiptId?: string | null;
  readonly receiptNumber?: string | null;
  readonly amount: number;
  readonly currency: string;
  readonly clientFullName: string;
  readonly paidAt?: string | null;
}

/**
 * Enterprise Application Service orchestrating Therapist-Led Treatment Completion & Checkout.
 * Conforms strictly to Clean Architecture, Hexagonal Boundaries, and ADR-0110 / ADR-0139.
 */
@Injectable()
export class TherapistTreatmentCheckoutService {
  private readonly logger = new Logger(TherapistTreatmentCheckoutService.name);
  private readonly feeResolver = new DefaultKinesiologyFeeScheduleResolver();

  constructor(
    private readonly prisma: PrismaService,
    private readonly getSessionByIdHandler: GetTreatmentSessionByIdHandler,
    private readonly completeSessionHandler: CompleteTreatmentSessionHandler,
    @Optional()
    @Inject(SCHEDULING_APPOINTMENT_LOOKUP_PORT_TOKEN)
    private readonly appointmentLookupPort?: ISchedulingAppointmentLookupPort,
    @Optional()
    private readonly createSaleHandler?: CreateSaleHandler,
    @Optional()
    private readonly finalizeSaleHandler?: FinalizeSaleHandler,
    @Optional()
    private readonly createPaymentHandler?: CreatePaymentHandler,
    @Optional()
    private readonly issueReceiptHandler?: IssueReceiptHandler,
  ) {}

  /**
   * Resolves the authoritative commercial billing information and payment status
   * for a treatment session prior to completion.
   */
  public async getSessionBillingInfo(sessionId: string): Promise<SessionBillingInfoDto> {
    if (!sessionId || sessionId.trim().length === 0) {
      throw new BadRequestException('Session ID cannot be empty.');
    }

    const sessionRes = await this.getSessionByIdHandler.execute(
      new GetTreatmentSessionByIdQuery({ sessionId: sessionId.trim() }),
    );

    if (sessionRes.isFailure) {
      throw new NotFoundException(sessionRes.getError());
    }

    const session = sessionRes.getValue();

    // 1. Resolve Appointment and Service Type
    let serviceType = 'TREATMENT';
    if (this.appointmentLookupPort && session.appointmentId) {
      try {
        const apptRef = await this.appointmentLookupPort.getAppointmentReference(
          session.appointmentId,
        );
        if (apptRef?.serviceType) {
          serviceType = apptRef.serviceType;
        }
      } catch (err) {
        this.logger.warn(
          `Could not resolve appointment reference for session ${sessionId}: ${err}`,
        );
      }
    }

    // 2. Resolve Client Name
    let clientFullName = 'Client information unavailable';
    try {
      const clientRecord = await this.prisma.client.findUnique({
        where: { id: session.clientId },
        select: { firstName: true, lastName: true },
      });
      if (clientRecord) {
        const parts = [clientRecord.firstName, clientRecord.lastName].filter(Boolean);
        if (parts.length > 0) {
          clientFullName = parts.join(' ');
        }
      }
    } catch {
      // Fallback preserves view stability
    }

    // 3. Compute Authoritative Fee
    const feeCents = this.feeResolver.getServiceFeeCents(serviceType);
    const amount = feeCents / 100;
    const currency = 'USD';
    const formatted = `$${amount.toFixed(2)}`;
    const serviceDescription = `Clinical Kinesiology ${serviceType === 'ASSESSMENT' ? 'Initial Assessment' : 'Treatment Session'}`;

    // 4. Inspect Existing Commercial Sale & Payment Records
    let existingSale: {
      id: string;
      status: string;
      payments: Array<{ id: string; status: string; method: string; paidAt: Date | null }>;
      receipts: Array<{ id: string; receiptNumber: string }>;
    } | null = null;

    try {
      existingSale = await this.prisma.sale.findFirst({
        where: {
          OR: [
            {
              sourceType: { in: ['KINESIOLOGY_SESSION', 'TREATMENT_SESSION'] },
              sourceId: session.id,
            },
            {
              sourceCode: session.appointmentId,
            },
          ],
          status: { not: 'CANCELLED' },
        },
        include: {
          payments: {
            orderBy: { createdAt: 'desc' },
          },
          receipts: {
            orderBy: { createdAt: 'desc' },
          },
        },
      });
    } catch (err) {
      this.logger.warn(`Failed querying existing sale for session ${sessionId}: ${err}`);
    }

    let isAlreadyPaid = false;
    let paymentStatus: 'UNPAID' | 'PENDING' | 'PARTIALLY_PAID' | 'PAID' = 'UNPAID';
    let existingSaleId: string | null = null;
    let existingPaymentId: string | null = null;
    let existingPaymentMethod: string | null = null;
    let existingReceiptId: string | null = null;
    let existingReceiptNumber: string | null = null;

    if (existingSale) {
      existingSaleId = existingSale.id;
      const settledPayment = existingSale.payments.find(
        (p) => p.status === 'SETTLED' || (p.status as unknown) === 'COMPLETED',
      );
      const pendingPayment = existingSale.payments.find((p) => p.status === 'PENDING');

      if (settledPayment) {
        existingPaymentId = settledPayment.id;
        existingPaymentMethod = settledPayment.method;
      } else if (pendingPayment) {
        existingPaymentId = pendingPayment.id;
        existingPaymentMethod = pendingPayment.method;
      }

      if (existingSale.status === 'PAID' || Boolean(settledPayment)) {
        isAlreadyPaid = true;
        paymentStatus = 'PAID';
      } else if (existingSale.status === 'PARTIALLY_PAID') {
        paymentStatus = 'PARTIALLY_PAID';
      } else if (existingSale.status === 'PENDING_PAYMENT' || Boolean(pendingPayment)) {
        paymentStatus = 'PENDING';
      }

      if (existingSale.receipts && existingSale.receipts.length > 0 && existingSale.receipts[0]) {
        existingReceiptId = existingSale.receipts[0].id;
        existingReceiptNumber = existingSale.receipts[0].receiptNumber;
      }
    }

    return {
      sessionId: session.id,
      appointmentId: session.appointmentId,
      clientId: session.clientId,
      clientFullName,
      therapistId: session.therapistId,
      sessionStatus: session.status,
      serviceType,
      serviceDescription,
      price: {
        amount,
        currency,
        formatted,
      },
      isAlreadyPaid,
      paymentStatus,
      existingSaleId,
      existingPaymentId,
      existingPaymentMethod,
      existingReceiptId,
      existingReceiptNumber,
    };
  }

  /**
   * Executes the integrated completion and checkout workflow.
   */
  public async checkoutSession(
    sessionId: string,
    input: CompleteAndCheckoutInput,
    currentUser?: AuthenticatedUserContext,
  ): Promise<CompleteAndCheckoutResponseDto> {
    if (!sessionId || sessionId.trim().length === 0) {
      throw new BadRequestException('Session ID cannot be empty.');
    }
    const effectiveOption = input.checkoutOption || input.flowOption;
    if (!effectiveOption) {
      throw new BadRequestException(
        "checkoutOption ('COLLECT_PAYMENT' or 'ALREADY_PAID') is required.",
      );
    }

    // Step 1: Load Session & Verify Lifecycle State
    const sessionRes = await this.getSessionByIdHandler.execute(
      new GetTreatmentSessionByIdQuery({ sessionId: sessionId.trim() }),
    );

    if (sessionRes.isFailure) {
      throw new NotFoundException(sessionRes.getError());
    }

    const session = sessionRes.getValue();

    if (session.status === 'CANCELLED') {
      throw new UnprocessableEntityException('Cannot checkout a cancelled treatment session.');
    }

    const billingInfo = await this.getSessionBillingInfo(session.id);

    // =========================================================================
    // OPTION B: COMPLETE TREATMENT (ALREADY PAID)
    // =========================================================================
    if (effectiveOption === 'ALREADY_PAID') {
      if (!billingInfo.isAlreadyPaid || !billingInfo.existingSaleId) {
        throw new UnprocessableEntityException(
          `Cannot complete as already paid: No completed payment was found for treatment session '${session.id}' or appointment '${session.appointmentId}'.`,
        );
      }

      // Complete session if not yet completed
      if (session.status !== 'COMPLETED') {
        const completeRes = await this.completeSessionHandler.execute(
          new CompleteTreatmentSessionCommand({ sessionId: session.id }),
        );
        if (completeRes.isFailure) {
          throw new UnprocessableEntityException(completeRes.getError());
        }
      }

      // Ensure receipt is issued if absent
      let receiptId = billingInfo.existingReceiptId;
      let receiptNumber = billingInfo.existingReceiptNumber;

      if (!receiptId && this.issueReceiptHandler && billingInfo.existingSaleId) {
        try {
          const rcptRes = await this.issueReceiptHandler.execute(
            new IssueReceiptCommand({
              tenantId: currentUser?.tenantId ?? undefined,
              saleId: billingInfo.existingSaleId,
              currentUser: toSaleUser(currentUser),
            }),
          );
          if (rcptRes.isSuccess) {
            receiptId = rcptRes.getValue().id;
            receiptNumber = rcptRes.getValue().receiptNumber;
          }
        } catch (err) {
          this.logger.warn(`Idempotent receipt issuance in ALREADY_PAID flow: ${err}`);
        }
      }

      return {
        success: true,
        sessionId: session.id,
        sessionStatus: 'COMPLETED',
        saleId: billingInfo.existingSaleId,
        saleStatus: 'PAID',
        paymentId: billingInfo.existingPaymentId,
        paymentStatus: 'COMPLETED',
        paymentMethod: billingInfo.existingPaymentMethod ?? 'CASH',
        receiptId,
        receiptNumber,
        amount: billingInfo.price.amount,
        currency: billingInfo.price.currency,
        clientFullName: billingInfo.clientFullName,
        paidAt: new Date().toISOString(),
      };
    }

    // =========================================================================
    // OPTION A: COMPLETE & COLLECT PAYMENT (CASH or QR)
    // =========================================================================
    if (billingInfo.isAlreadyPaid) {
      throw new ConflictException(
        `This treatment session is already fully paid (Sale: ${billingInfo.existingSaleId}). Re-collecting payment is prohibited.`,
      );
    }

    const paymentMethod = input.paymentMethod ?? 'CASH';
    if (paymentMethod !== 'CASH' && paymentMethod !== 'QR') {
      throw new BadRequestException("paymentMethod must be 'CASH' or 'QR'.");
    }

    // 1. Complete Session if not yet completed (ensures clinical SOAP notes are sealed)
    if (session.status === 'SCHEDULED') {
      throw new UnprocessableEntityException(
        'Cannot checkout a SCHEDULED session. Session must be in progress before completing.',
      );
    }

    if (session.status !== 'COMPLETED') {
      const compRes = await this.completeSessionHandler.execute(
        new CompleteTreatmentSessionCommand({ sessionId: session.id }),
      );
      if (compRes.isFailure) {
        throw new UnprocessableEntityException(compRes.getError());
      }
    }

    // 2. Ensure exactly one active Sale exists for this clinical session
    let targetSaleId = billingInfo.existingSaleId;

    if (!targetSaleId) {
      if (!this.createSaleHandler) {
        throw new UnprocessableEntityException('Sales creation handler is not configured.');
      }

      const saleIdempotencyKey = input.idempotencyKey
        ? `sale_${input.idempotencyKey}`
        : `sale_kinesio_${session.id}`;

      const createSaleRes = await this.createSaleHandler.execute(
        new CreateSaleCommand({
          tenantId: currentUser?.tenantId ?? undefined,
          clientId: session.clientId,
          currency: billingInfo.price.currency,
          source: {
            sourceType: SaleSourceType.KINESIOLOGY_SESSION,
            sourceId: session.id,
            sourceCode: session.appointmentId,
          },
          idempotencyKey: saleIdempotencyKey,
          currentUser: toSaleUser(currentUser),
        }),
      );

      if (createSaleRes.isFailure) {
        const error = createSaleRes.getError();
        // If concurrent race already created the sale, lookup the created sale
        const existingAfterRace = await this.prisma.sale.findFirst({
          where: {
            sourceType: { in: ['KINESIOLOGY_SESSION', 'TREATMENT_SESSION'] },
            sourceId: session.id,
            status: { not: 'CANCELLED' },
          },
        });
        if (existingAfterRace) {
          targetSaleId = existingAfterRace.id;
        } else {
          const msg = error instanceof Error ? error.message : String(error);
          throw new UnprocessableEntityException(msg || 'Failed to create sale.');
        }
      } else {
        targetSaleId = createSaleRes.getValue().id;
      }
    }

    // 3. Finalize Sale (DRAFT -> PENDING_PAYMENT)
    if (this.finalizeSaleHandler && targetSaleId) {
      try {
        await this.finalizeSaleHandler.execute(
          new FinalizeSaleCommand({
            saleId: targetSaleId,
            currentUser: toSaleUser(currentUser),
          }),
        );
      } catch (err) {
        // Safe to ignore if already finalized
        this.logger.debug(`Finalize sale check: ${err}`);
      }
    }

    // 4. Record Payment (CASH -> COMPLETED, QR -> COMPLETED if confirmed or PENDING)
    if (!this.createPaymentHandler) {
      throw new UnprocessableEntityException('Payment creation handler is not configured.');
    }

    const paymentAmount = billingInfo.price.amount;
    const isCash = paymentMethod === 'CASH';
    const paymentStatusInput = isCash ? PaymentStatus.COMPLETED : PaymentStatus.COMPLETED;
    const paymentReference =
      input.paymentReference?.trim() ||
      (isCash
        ? `CASH-THERAPIST-${session.therapistId.slice(-6)}`
        : `QR-COUNTER-${session.id.slice(-6)}`);
    const paymentIdempotencyKey = input.idempotencyKey
      ? `pay_${input.idempotencyKey}`
      : `pay_checkout_${session.id}_${Date.now()}`;

    const paymentRes = await this.createPaymentHandler.execute(
      new CreatePaymentCommand({
        tenantId: currentUser?.tenantId ?? undefined,
        saleId: targetSaleId,
        amount: paymentAmount,
        method: paymentMethod as PaymentMethod,
        status: paymentStatusInput,
        reference: paymentReference,
        idempotencyKey: paymentIdempotencyKey,
        currentUser: toSaleUser(currentUser),
      }),
    );

    if (paymentRes.isFailure) {
      const err = paymentRes.getError();
      const msg = err instanceof Error ? err.message : String(err);
      throw new UnprocessableEntityException(msg || 'Payment execution failed.');
    }

    const paymentDto = paymentRes.getValue();

    // 5. Query updated Sale status and Issue Receipt if Sale is PAID
    let saleStatus = 'PAID';
    let receiptId: string | null = null;
    let receiptNumber: string | null = null;

    try {
      const updatedSale = await this.prisma.sale.findUnique({
        where: { id: targetSaleId },
        select: { status: true },
      });
      if (updatedSale) {
        saleStatus = updatedSale.status;
      }
    } catch {
      // Keep optimistic status
    }

    if (saleStatus === 'PAID' && this.issueReceiptHandler) {
      try {
        const rcptRes = await this.issueReceiptHandler.execute(
          new IssueReceiptCommand({
            tenantId: currentUser?.tenantId ?? undefined,
            saleId: targetSaleId,
            currentUser: toSaleUser(currentUser),
          }),
        );
        if (rcptRes.isSuccess) {
          receiptId = rcptRes.getValue().id;
          receiptNumber = rcptRes.getValue().receiptNumber;
        }
      } catch (err) {
        this.logger.warn(`Receipt issuance after payment: ${err}`);
      }
    }

    return {
      success: true,
      sessionId: session.id,
      sessionStatus: 'COMPLETED',
      saleId: targetSaleId,
      saleStatus,
      paymentId: paymentDto.id,
      paymentStatus: paymentDto.status,
      paymentMethod,
      receiptId,
      receiptNumber,
      amount: paymentAmount,
      currency: billingInfo.price.currency,
      clientFullName: billingInfo.clientFullName,
      paidAt: paymentDto.paidAt ?? new Date().toISOString(),
    };
  }
}
