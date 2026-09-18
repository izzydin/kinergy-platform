import { SalesCommandHandler } from '../shared/sales-command-handler.interface';
import { SalesApplicationResult } from '../shared/sales-application-result';
import { CreateSaleCommand } from '../commands/create-sale.command';
import { SaleDTO } from '../dtos/sale.dto';
import { SaleMapper } from '../mappers/sale.mapper';
import { Sale } from '../../domain/sale.aggregate';
import { Money } from '../../domain/value-objects/money.vo';
import { Discount } from '../../domain/value-objects/discount.vo';
import { SourceReference } from '../../domain/value-objects/source-reference.vo';
import { SaleRepositoryInterface } from '../../infrastructure/persistence/prisma/repositories/prisma-sale.repository';
import { SalesEventPublisherPort } from '../ports/sales-event-publisher.port';
import { Clock, SystemClock } from '../../domain/shared/clock';

export class CreateSaleHandler implements SalesCommandHandler<
  CreateSaleCommand,
  SalesApplicationResult<SaleDTO>
> {
  constructor(
    private readonly saleRepository: SaleRepositoryInterface,
    private readonly clock: Clock = new SystemClock(),
    private readonly eventPublisher?: SalesEventPublisherPort,
  ) {}

  public async execute(command: CreateSaleCommand): Promise<SalesApplicationResult<SaleDTO>> {
    try {
      const { input } = command;
      const currency = input.currency
        ? input.currency.trim().toUpperCase()
        : Money.DEFAULT_CURRENCY;

      const source = SourceReference.create({
        sourceType: input.source.sourceType,
        sourceId: input.source.sourceId,
        sourceCode: input.source.sourceCode ?? null,
      });

      let orderDiscount: Discount | undefined;
      if (input.orderDiscount) {
        const typeStr = input.orderDiscount.type.toUpperCase();
        if (typeStr === 'PERCENTAGE') {
          orderDiscount = Discount.percentage(
            input.orderDiscount.value,
            input.orderDiscount.reason,
          );
        } else {
          orderDiscount = Discount.fixed(input.orderDiscount.value, input.orderDiscount.reason);
        }
      }

      const items = input.items?.map((itemInput) => {
        let itemDiscount: Discount | null = null;
        if (itemInput.discount) {
          const typeStr = itemInput.discount.type.toUpperCase();
          if (typeStr === 'PERCENTAGE') {
            itemDiscount = Discount.percentage(itemInput.discount.value, itemInput.discount.reason);
          } else {
            itemDiscount = Discount.fixed(itemInput.discount.value, itemInput.discount.reason);
          }
        }

        return {
          source,
          description: itemInput.description,
          skuOrCode: itemInput.skuOrCode ?? null,
          quantity: itemInput.quantity,
          unitPrice: Money.create(itemInput.unitPriceAmount, currency),
          discount: itemDiscount,
        };
      });

      const sale = Sale.create(
        {
          tenantId: input.tenantId,
          clientId: input.clientId,
          currency,
          source,
          items,
          orderDiscount,
        },
        this.clock,
      );

      await this.saleRepository.save(sale);

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
