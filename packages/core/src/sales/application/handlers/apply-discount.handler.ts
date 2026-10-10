import { SalesCommandHandler } from '../shared/sales-command-handler.interface';
import { SalesApplicationResult } from '../shared/sales-application-result';
import { ApplyDiscountCommand } from '../commands/apply-discount.command';
import { SaleDTO } from '../dtos/sale.dto';
import { SaleMapper } from '../mappers/sale.mapper';
import { Discount } from '../../domain/value-objects/discount.vo';
import { DiscountType } from '../../domain/enums/discount-type.enum';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { SalesEventPublisherPort } from '../ports/sales-event-publisher.port';
import { DomainEvent } from '../../domain/shared/domain-event';
import { Clock, SystemClock } from '../../domain/shared/clock';
import { SaleNotFoundException } from '../exceptions/sale-not-found.exception';
import { InvalidSaleStateException } from '../../domain/exceptions/invalid-sale-state.exception';
import {
  checkSaleAuthorization,
  enforceSaleTenantIsolation,
  SALE_MUTATION_ROLES,
} from '../shared/sale-authorization';

/**
 * ApplyDiscountHandler coordinates applying an order-level discount to a Sale.
 *
 * Responsibilities:
 * 1. Accept ApplyDiscountCommand and perform application-level structural validation.
 * 2. Load the Sale aggregate from SaleRepositoryPort inside a transaction boundary.
 * 3. Validate Sale existence (fail with SaleNotFoundException if missing).
 * 4. Construct the domain Discount representation (Milestone 7.3 model).
 * 5. Invoke sale.applyDiscount(discount, clock), which delegates recalculation of
 *    totals deterministically to the domain.
 * 6. Persist the updated aggregate via SaleRepositoryPort atomically.
 * 7. Dispatch uncommitted domain events strictly after transaction commit.
 * 8. Return updated SaleDTO representation.
 */
export class ApplyDiscountHandler implements SalesCommandHandler<
  ApplyDiscountCommand,
  SalesApplicationResult<SaleDTO>
> {
  constructor(
    private readonly saleRepository: SaleRepositoryPort,
    private readonly clock: Clock = new SystemClock(),
    private readonly eventPublisher?: SalesEventPublisherPort,
  ) {}

  public async execute(command: ApplyDiscountCommand): Promise<SalesApplicationResult<SaleDTO>> {
    try {
      if (!command || !command.input) {
        return SalesApplicationResult.fail(
          new InvalidSaleStateException('ApplyDiscountCommand input cannot be null or undefined.'),
        );
      }

      const { input } = command;
      const saleId = input.saleId?.trim();
      if (!saleId) {
        return SalesApplicationResult.fail(
          new InvalidSaleStateException('Sale ID cannot be empty or whitespace.'),
        );
      }

      if (!input.discount) {
        return SalesApplicationResult.fail(
          new InvalidSaleStateException('Discount payload cannot be empty or null.'),
        );
      }

      const runInTx = this.saleRepository.withTransaction
        ? (fn: (repo: SaleRepositoryPort) => Promise<SalesApplicationResult<SaleDTO>>) =>
            this.saleRepository.withTransaction!(fn)
        : (fn: (repo: SaleRepositoryPort) => Promise<SalesApplicationResult<SaleDTO>>) =>
            fn(this.saleRepository);

      let eventsToPublish: ReadonlyArray<DomainEvent> = [];

      const result = await runInTx(async (repo) => {
        // 1. Load Sale from transactional repository
        const sale = await repo.findById(saleId);

        // 2. Validate Sale existence
        if (!sale) {
          return SalesApplicationResult.fail(new SaleNotFoundException(saleId));
        }

        // Multi-tenant boundary check (ADR-0135 Section 9)
        enforceSaleTenantIsolation(
          sale.tenantId,
          input.tenantId ?? input.currentUser?.tenantId,
          saleId,
        );

        // Caller authorization check: sales.manage (ADR-0135)
        checkSaleAuthorization(input.currentUser, ['sales.manage'], SALE_MUTATION_ROLES);

        // 3. Construct the Discount domain representation without duplicating domain business rules
        const rawType = input.discount.type;
        const upperType = typeof rawType === 'string' ? rawType.toUpperCase() : rawType;
        let discount: Discount;

        if (upperType === DiscountType.PERCENTAGE) {
          discount = Discount.percentage(input.discount.value, input.discount.reason);
        } else if (upperType === DiscountType.FIXED) {
          discount = Discount.fixed(input.discount.value, input.discount.reason);
        } else if (upperType === DiscountType.FIXED_AMOUNT) {
          discount = Discount.fixedAmount(input.discount.value, input.discount.reason);
        } else {
          discount = Discount.create({
            type: rawType as unknown as DiscountType,
            value: input.discount.value,
            reason: input.discount.reason,
          });
        }

        // 4. Invoke sale.applyDiscount(...)
        // 5. Recalculates totals through domain recalculateTotals() inside sale.applyDiscount
        sale.applyDiscount(discount, this.clock);

        // 6. Persist the aggregate atomically
        await repo.save(sale);

        // Capture uncommitted domain events to dispatch only after successful transaction commit
        eventsToPublish = sale.getUncommittedEvents();
        sale.clearEvents();

        // Return the updated Sale representation
        return SalesApplicationResult.ok(SaleMapper.toDTO(sale));
      });

      // Dispatch domain events strictly after successful transaction commit
      if (result.isSuccess && this.eventPublisher && eventsToPublish.length > 0) {
        await this.eventPublisher.publish(eventsToPublish);
      }

      // 7. Return the updated Sale representation
      return result;
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      return SalesApplicationResult.fail(error);
    }
  }
}
