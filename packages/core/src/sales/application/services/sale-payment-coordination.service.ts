import { SalesApplicationResult } from '../shared/sales-application-result';
import { SaleDTO } from '../dtos/sale.dto';
import { SaleMapper } from '../mappers/sale.mapper';
import { SaleId } from '../../domain/value-objects/sale-id.vo';
import { PaymentId } from '../../domain/value-objects/payment-id.vo';
import { Money } from '../../domain/value-objects/money.vo';
import { SaleStatus } from '../../domain/enums/sale-status.enum';
import { PaymentStatus } from '../../domain/enums/payment-status.enum';
import { Clock, SystemClock } from '../../domain/shared/clock';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { PaymentRepositoryPort } from '../ports/payment-repository.port';
import { SalesEventPublisherPort } from '../ports/sales-event-publisher.port';
import { enforceTenantIsolation } from '../shared/payment-authorization';
import { SaleNotFoundException } from '../exceptions/sale-not-found.exception';
import { PaymentNotFoundException } from '../exceptions/payment-not-found.exception';
import { PaymentSaleMismatchException } from '../exceptions/payment-sale-mismatch.exception';
import { PaymentNotCompletedException } from '../exceptions/payment-not-completed.exception';
import { PaymentCurrencyMismatchException } from '../exceptions/payment-currency-mismatch.exception';
import { InsufficientPaymentException } from '../exceptions/insufficient-payment.exception';
import { InvalidSaleTransitionException } from '../../domain/exceptions/invalid-sale-transition.exception';
import { InvalidSaleStateException } from '../../domain/exceptions/invalid-sale-state.exception';
import { InvalidMoneyException } from '../../domain/exceptions/invalid-money.exception';

export interface CoordinateSalePaymentSettlementParams {
  saleId: SaleId | string;
  paymentId: PaymentId | string;
  tenantId?: string;
}

/**
 * Cross-Aggregate Application Orchestrator for the Sale-Payment relationship.
 *
 * Conforms strictly to ADR-0115, ADR-0116, and ADR-0119:
 * - Payment aggregate owns its own internal state machine and lifecycle.
 * - Sale aggregate owns its own internal state machine, totals, and lifecycle.
 * - Aggregates NEVER merge, directly invoke each other's mutating methods, or mutate
 *   each other's persistence stores.
 * - The application layer coordinates the relationship using the authoritative 7-step verification:
 *   1. Sale exists.
 *   2. Payment exists.
 *   3. Payment belongs to the Sale.
 *   4. Payment is COMPLETED (settled).
 *   5. Payment amount is valid according to Phase 7 commercial and currency rules.
 *   6. Sale is in a state that may become PAID (PENDING_PAYMENT or PARTIALLY_PAID).
 *   7. Sale aggregate performs the state transition via sale.markPaid().
 */
export class SalePaymentCoordinationService {
  constructor(
    private readonly saleRepository: SaleRepositoryPort,
    private readonly paymentRepository: PaymentRepositoryPort,
    private readonly clock: Clock = new SystemClock(),
    private readonly eventPublisher?: SalesEventPublisherPort,
  ) {}

  public async coordinateSalePaymentSettlement(
    params: CoordinateSalePaymentSettlementParams,
  ): Promise<SalesApplicationResult<SaleDTO>> {
    try {
      const saleIdString =
        params.saleId instanceof SaleId ? params.saleId.value : params.saleId?.trim();
      const paymentIdString =
        params.paymentId instanceof PaymentId ? params.paymentId.value : params.paymentId?.trim();

      if (!saleIdString) {
        return SalesApplicationResult.fail(
          new InvalidSaleStateException('Sale ID cannot be empty or whitespace.'),
        );
      }
      if (!paymentIdString) {
        return SalesApplicationResult.fail(
          new InvalidSaleStateException('Payment ID cannot be empty or whitespace.'),
        );
      }

      // Step 1: Verify Sale exists and enforce tenant isolation
      const sale = await this.saleRepository.findById(saleIdString);
      if (!sale) {
        return SalesApplicationResult.fail(new SaleNotFoundException(saleIdString));
      }
      if (params.tenantId) {
        enforceTenantIsolation(sale.tenantId, params.tenantId);
      }

      // Step 2: Verify Payment exists and enforce tenant isolation
      const payment = await this.paymentRepository.findById(paymentIdString);
      if (!payment) {
        return SalesApplicationResult.fail(new PaymentNotFoundException(paymentIdString));
      }
      if (params.tenantId) {
        enforceTenantIsolation(payment.tenantId, params.tenantId);
      }

      // Step 3: Verify Payment belongs to the target Sale
      if (payment.saleId.value !== sale.id.value) {
        return SalesApplicationResult.fail(
          new PaymentSaleMismatchException(payment.id.value, payment.saleId.value, sale.id.value),
        );
      }

      // Step 4: Verify Payment is COMPLETED (settled)
      if (payment.status !== PaymentStatus.COMPLETED) {
        return SalesApplicationResult.fail(
          new PaymentNotCompletedException(payment.id.value, payment.status),
        );
      }

      // Step 5: Verify Payment amount is valid according to Phase 7 monetary rules
      if (payment.amount.currency !== sale.currency) {
        return SalesApplicationResult.fail(
          new PaymentCurrencyMismatchException(payment.amount.currency, sale.currency),
        );
      }

      if (payment.amount.cents <= 0) {
        return SalesApplicationResult.fail(
          new InvalidMoneyException(
            `Payment amount must be positive. Received: ${payment.amount.toString()}`,
          ),
        );
      }

      // Calculate cumulative settled payments for this sale to verify debt discharge
      const allPayments = await this.paymentRepository.findBySaleId(sale.id);
      const settledTotal = allPayments
        .filter((p) => p.status === PaymentStatus.COMPLETED)
        .reduce((acc, p) => acc.add(p.amount), Money.zero(sale.currency));

      if (settledTotal.lessThan(sale.total)) {
        return SalesApplicationResult.fail(
          new InsufficientPaymentException(
            `Settled payments sum (${settledTotal.toString()}) is insufficient to cover Sale total (${sale.total.toString()}).`,
          ),
        );
      }

      // Step 6: Verify Sale is in a state that may become PAID
      if (sale.status === SaleStatus.PAID) {
        return SalesApplicationResult.fail(
          new InvalidSaleTransitionException(
            'Cannot mark Sale as PAID: Sale is already in PAID status.',
            sale.status,
            SaleStatus.PAID,
          ),
        );
      }

      if (sale.status === SaleStatus.CANCELLED) {
        return SalesApplicationResult.fail(
          new InvalidSaleTransitionException(
            `Cannot mark Sale as PAID: Sale is in terminal state '${sale.status}'.`,
            sale.status,
            SaleStatus.PAID,
          ),
        );
      }

      if (!sale.canTransitionTo(SaleStatus.PAID)) {
        return SalesApplicationResult.fail(
          new InvalidSaleTransitionException(
            `Cannot transition Sale from status '${sale.status}' to 'PAID'. Sale must be in PENDING_PAYMENT or PARTIALLY_PAID state.`,
            sale.status,
            SaleStatus.PAID,
          ),
        );
      }

      // Step 7: Sale aggregate performs the authoritative state transition
      sale.markPaid(this.clock);

      // Persist Sale aggregate state (Payment is NOT mutated; Payment remains untouched)
      await this.saleRepository.save(sale);

      // Publish Sale domain events
      const events = sale.getUncommittedEvents();
      if (this.eventPublisher && events.length > 0) {
        await this.eventPublisher.publish(events);
      }
      sale.clearEvents();

      return SalesApplicationResult.ok(SaleMapper.toDTO(sale));
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      return SalesApplicationResult.fail(error);
    }
  }
}
