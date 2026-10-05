import { SalesCommandHandler } from '../shared/sales-command-handler.interface';
import { SalesApplicationResult } from '../shared/sales-application-result';
import { AddSaleItemCommand } from '../commands/add-sale-item.command';
import { SaleDTO } from '../dtos/sale.dto';
import { SaleMapper } from '../mappers/sale.mapper';
import { Money } from '../../domain/value-objects/money.vo';
import { Discount } from '../../domain/value-objects/discount.vo';
import { DiscountType } from '../../domain/enums/discount-type.enum';
import { SourceReference } from '../../domain/value-objects/source-reference.vo';
import { SaleSource } from '../../domain/value-objects/sale-source.vo';
import { SourceType, isValidSourceType } from '../../domain/enums/source-type.enum';
import { SaleSourceType, isValidSaleSourceType } from '../../domain/enums/sale-source-type.enum';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { SalesEventPublisherPort } from '../ports/sales-event-publisher.port';
import { Clock, SystemClock } from '../../domain/shared/clock';
import { SaleNotFoundException } from '../exceptions/sale-not-found.exception';
import { InvalidSaleStateException } from '../../domain/exceptions/invalid-sale-state.exception';

export class AddSaleItemHandler implements SalesCommandHandler<
  AddSaleItemCommand,
  SalesApplicationResult<SaleDTO>
> {
  constructor(
    private readonly saleRepository: SaleRepositoryPort,
    private readonly clock: Clock = new SystemClock(),
    private readonly eventPublisher?: SalesEventPublisherPort,
  ) {}

  public async execute(command: AddSaleItemCommand): Promise<SalesApplicationResult<SaleDTO>> {
    try {
      if (!command || !command.input) {
        return SalesApplicationResult.fail(
          new InvalidSaleStateException('AddSaleItemCommand input cannot be null or undefined.'),
        );
      }

      const { input } = command;
      const saleId = input.saleId?.trim();
      if (!saleId) {
        return SalesApplicationResult.fail(
          new InvalidSaleStateException('Sale ID cannot be empty or whitespace.'),
        );
      }

      // 1. Load the Sale Aggregate using SaleRepository
      const sale = await this.saleRepository.findById(saleId);

      // 2. Fail with the established NotFound error if Sale does not exist
      if (!sale) {
        return SalesApplicationResult.fail(new SaleNotFoundException(saleId));
      }

      // 3. Construct appropriate domain value objects
      let source: SaleSource | SourceReference;
      if (input.source) {
        const rawSourceType = input.source.sourceType;
        if (isValidSaleSourceType(rawSourceType)) {
          source = SaleSource.create(
            rawSourceType as SaleSourceType,
            input.source.sourceId ? input.source.sourceId.trim() : '',
          );
        } else if (isValidSourceType(rawSourceType)) {
          source = SourceReference.create({
            sourceType: rawSourceType as SourceType,
            sourceId: input.source.sourceId ? input.source.sourceId.trim() : '',
            sourceCode: input.source.sourceCode ? input.source.sourceCode.trim() : null,
          });
        } else {
          source = SourceReference.create({
            sourceType: rawSourceType as unknown as SourceType,
            sourceId: input.source.sourceId ? input.source.sourceId.trim() : '',
            sourceCode: input.source.sourceCode ? input.source.sourceCode.trim() : null,
          });
        }
      } else {
        source = sale.source as SaleSource | SourceReference;
      }

      const unitPrice = Money.create(input.unitPriceAmount, sale.currency);

      let discount: Discount | null = null;
      if (input.discount) {
        const typeStr = input.discount.type?.toUpperCase();
        if (typeStr === 'PERCENTAGE') {
          discount = Discount.percentage(input.discount.value, input.discount.reason);
        } else if (typeStr === 'FIXED') {
          discount = Discount.fixed(input.discount.value, input.discount.reason);
        } else {
          discount = Discount.create({
            type: input.discount.type as unknown as DiscountType,
            value: input.discount.value,
            reason: input.discount.reason,
          });
        }
      }

      // 4. Invoke sale.addItem(...) which validates invariants and recalculates totals deterministically
      sale.addItem(
        {
          source,
          description: input.description,
          skuOrCode: input.skuOrCode ?? null,
          quantity: input.quantity,
          unitPrice,
          discount,
        },
        this.clock,
      );

      // 5. Persist the modified aggregate through SaleRepository
      await this.saleRepository.save(sale);

      // 6. Dispatch domain events
      const events = sale.getUncommittedEvents();
      if (this.eventPublisher && events.length > 0) {
        await this.eventPublisher.publish(events);
      }
      sale.clearEvents();

      // 7. Return approved Sale representation
      return SalesApplicationResult.ok(SaleMapper.toDTO(sale));
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      return SalesApplicationResult.fail(error);
    }
  }
}
