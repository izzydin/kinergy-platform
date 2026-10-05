import { SalesCommandHandler } from '../shared/sales-command-handler.interface';
import { SalesApplicationResult } from '../shared/sales-application-result';
import { ApplyDiscountCommand } from '../commands/apply-discount.command';
import { SaleDTO } from '../dtos/sale.dto';
import { SaleMapper } from '../mappers/sale.mapper';
import { Discount } from '../../domain/value-objects/discount.vo';
import { DiscountType } from '../../domain/enums/discount-type.enum';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { SalesEventPublisherPort } from '../ports/sales-event-publisher.port';
import { Clock, SystemClock } from '../../domain/shared/clock';
import { SaleNotFoundException } from '../exceptions/sale-not-found.exception';
import { InvalidSaleStateException } from '../../domain/exceptions/invalid-sale-state.exception';

/**
 * ApplyDiscountHandler coordinates applying an order-level discount to a Sale.
 *
 * Responsibilities:
 * 1. Accept ApplyDiscountCommand and perform application-level structural validation.
 * 2. Load the Sale aggregate from SaleRepositoryPort.
 * 3. Validate Sale existence (fail with SaleNotFoundException if missing).
 * 4. Construct the domain Discount representation (Milestone 7.3 model).
 * 5. Invoke sale.applyDiscount(discount, clock), which delegates recalculation of
 *    totals deterministically to the domain.
 * 6. Persist the updated aggregate via SaleRepositoryPort.
 * 7. Dispatch uncommitted domain events.
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

      // 1. Load Sale
      const sale = await this.saleRepository.findById(saleId);

      // 2. Validate Sale existence
      if (!sale) {
        return SalesApplicationResult.fail(new SaleNotFoundException(saleId));
      }

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

      // 6. Persist the aggregate
      await this.saleRepository.save(sale);

      // Dispatch domain events
      const events = sale.getUncommittedEvents();
      if (this.eventPublisher && events.length > 0) {
        await this.eventPublisher.publish(events);
      }
      sale.clearEvents();

      // 7. Return the updated Sale representation
      return SalesApplicationResult.ok(SaleMapper.toDTO(sale));
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      return SalesApplicationResult.fail(error);
    }
  }
}
