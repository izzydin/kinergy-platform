import { SalesCommandHandler } from '../shared/sales-command-handler.interface';
import { SalesApplicationResult } from '../shared/sales-application-result';
import { CancelSaleCommand } from '../commands/cancel-sale.command';
import { SaleDTO } from '../dtos/sale.dto';
import { SaleMapper } from '../mappers/sale.mapper';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { PaymentRepositoryPort } from '../ports/payment-repository.port';
import { IUnitOfWork } from '../ports/unit-of-work.port';
import { SalesTransactionCoordinatorPort } from '../ports/sales-transaction-coordinator.port';
import { SalesEventPublisherPort } from '../ports/sales-event-publisher.port';
import { DomainEvent } from '../../domain/shared/domain-event';
import { Clock, SystemClock } from '../../domain/shared/clock';
import { PaymentStatus } from '../../domain/enums/payment-status.enum';
import { SaleNotFoundException } from '../exceptions/sale-not-found.exception';
import { InvalidSaleStateException } from '../../domain/exceptions/invalid-sale-state.exception';
import { enforceTenantIsolation } from '../shared/payment-authorization';
import {
  checkSaleAuthorization,
  enforceSaleTenantIsolation,
  SALE_CANCELLATION_ROLES,
} from '../shared/sale-authorization';

/**
 * Application command handler orchestrating explicit Sale cancellation.
 *
 * Responsibilities:
 * 1. Accept and validate the CancelSaleCommand input shape (saleId required).
 * 2. Load the Sale Aggregate through SaleRepositoryPort inside a transaction boundary.
 * 3. Verify Sale exists (and enforce tenant isolation when tenantId is supplied).
 * 4. Invoke domain operation: sale.cancel(reason, clock).
 *    - Never directly sets status = CANCELLED.
 *    - The Sale Aggregate owns whether cancellation is allowed, valid lifecycle transitions,
 *      and cancellation invariants.
 * 5. ADR-0140 §3.F.3: Cascade cancellation to active PENDING payments on this sale
 *    to prevent orphaned pending tenders, while preserving historical completed payments.
 * 6. Persist the updated aggregates atomically within transaction / UnitOfWork boundary.
 * 7. Publish uncommitted domain events strictly after transaction commit.
 * 8. Return the updated application representation (SaleDTO).
 */
export class CancelSaleHandler implements SalesCommandHandler<
  CancelSaleCommand,
  SalesApplicationResult<SaleDTO>
> {
  constructor(
    private readonly saleRepository: SaleRepositoryPort,
    private readonly clock: Clock = new SystemClock(),
    private readonly eventPublisher?: SalesEventPublisherPort,
    private readonly paymentRepository?: PaymentRepositoryPort,
    private readonly unitOfWork?: IUnitOfWork | SalesTransactionCoordinatorPort,
  ) {}

  public async execute(command: CancelSaleCommand): Promise<SalesApplicationResult<SaleDTO>> {
    try {
      if (!command || !command.input) {
        return SalesApplicationResult.fail(
          new InvalidSaleStateException('Command and input cannot be null or undefined.'),
        );
      }

      const { input } = command;
      const saleId = input.saleId?.trim();
      if (!saleId) {
        return SalesApplicationResult.fail(
          new InvalidSaleStateException('Sale ID cannot be empty or whitespace.'),
        );
      }

      let eventsToPublish: DomainEvent[] = [];
      let resultDto: SaleDTO | null = null;

      const performCancellation = async (repo: SaleRepositoryPort): Promise<SaleDTO> => {
        // 1. Load Sale from repository
        const sale = await repo.findById(saleId);

        // 2. Verify Sale exists
        if (!sale) {
          throw new SaleNotFoundException(saleId);
        }

        // Enforce multi-tenant isolation if tenantId is provided in command
        if (input.tenantId) {
          enforceTenantIsolation(sale.tenantId, input.tenantId);
        } else if (input.currentUser?.tenantId) {
          enforceSaleTenantIsolation(sale.tenantId, input.currentUser.tenantId, saleId);
        }

        // Caller authorization check: sales.cancel (ADR-0135)
        checkSaleAuthorization(input.currentUser, ['sales.cancel'], SALE_CANCELLATION_ROLES);

        // 3. Invoke domain operation - domain owns lifecycle rules and cancellation invariants
        sale.cancel(input.reason, this.clock);

        // 4. ADR-0140 §3.F.3: Cascade cancellation to active PENDING payments to avoid orphaned tenders
        const pendingPaymentEvents: DomainEvent[] = [];
        if (this.paymentRepository) {
          const payments = await this.paymentRepository.findBySaleId(sale.id);
          const pendingPayments = payments.filter((p) => p.status === PaymentStatus.PENDING);
          for (const payment of pendingPayments) {
            payment.cancel(`Sale cancelled: ${input.reason}`, this.clock);
            await this.paymentRepository.save(payment);
            pendingPaymentEvents.push(...payment.getUncommittedEvents());
            payment.clearEvents();
          }
        }

        // 5. Persist aggregate through repository atomically
        await repo.save(sale);

        // Capture uncommitted domain events to dispatch only after successful transaction commit
        eventsToPublish = [...sale.getUncommittedEvents(), ...pendingPaymentEvents];
        sale.clearEvents();

        return SaleMapper.toDTO(sale);
      };

      if (this.unitOfWork) {
        const persistWork = async () => {
          resultDto = await performCancellation(this.saleRepository);
        };

        if (
          'executeInTransaction' in this.unitOfWork &&
          typeof this.unitOfWork.executeInTransaction === 'function'
        ) {
          await this.unitOfWork.executeInTransaction(persistWork);
        } else if (
          'runInTransaction' in this.unitOfWork &&
          typeof (this.unitOfWork as unknown as { runInTransaction: unknown }).runInTransaction ===
            'function'
        ) {
          await (
            this.unitOfWork as unknown as {
              runInTransaction: (fn: () => Promise<void>) => Promise<void>;
            }
          ).runInTransaction(persistWork);
        } else {
          await persistWork();
        }
      } else if (this.saleRepository.withTransaction) {
        resultDto = await this.saleRepository.withTransaction(async (txRepo) => {
          return performCancellation(txRepo);
        });
      } else {
        resultDto = await performCancellation(this.saleRepository);
      }

      // 6. Publish domain events strictly after successful transaction commit
      if (this.eventPublisher && eventsToPublish.length > 0) {
        await this.eventPublisher.publish(eventsToPublish);
      }

      return SalesApplicationResult.ok(resultDto!);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      return SalesApplicationResult.fail(error);
    }
  }
}
