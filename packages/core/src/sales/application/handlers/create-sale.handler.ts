import { SalesCommandHandler } from '../shared/sales-command-handler.interface';
import { SalesApplicationResult } from '../shared/sales-application-result';
import { CreateSaleCommand } from '../commands/create-sale.command';
import { SaleDTO } from '../dtos/sale.dto';
import { SaleMapper } from '../mappers/sale.mapper';
import { Sale } from '../../domain/sale.aggregate';
import { SaleId } from '../../domain/value-objects/sale-id.vo';
import { Money } from '../../domain/value-objects/money.vo';
import { Discount } from '../../domain/value-objects/discount.vo';
import { SourceReference } from '../../domain/value-objects/source-reference.vo';
import { SourceType } from '../../domain/enums/source-type.enum';
import { DuplicateSaleException } from '../../domain/exceptions/duplicate-sale.exception';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { SalesEventPublisherPort } from '../ports/sales-event-publisher.port';
import { Clock, SystemClock } from '../../domain/shared/clock';

export class CreateSaleHandler implements SalesCommandHandler<
  CreateSaleCommand,
  SalesApplicationResult<SaleDTO>
> {
  constructor(
    private readonly saleRepository: SaleRepositoryPort,
    private readonly clock: Clock = new SystemClock(),
    private readonly eventPublisher?: SalesEventPublisherPort,
  ) {}

  public async execute(command: CreateSaleCommand): Promise<SalesApplicationResult<SaleDTO>> {
    try {
      const { input } = command;
      const currency = input.currency
        ? input.currency.trim().toUpperCase()
        : Money.DEFAULT_CURRENCY;

      const effectiveId = input.id?.trim() || input.idempotencyKey?.trim();

      // 1. Idempotency Check: Caller-supplied transaction identity
      if (effectiveId) {
        const existingSale = await this.saleRepository.findById(effectiveId);
        if (existingSale) {
          const isMatchingRetry =
            (existingSale.tenantId ?? '') === (input.tenantId?.trim() ?? '') &&
            (existingSale.clientId ?? '') === (input.clientId?.trim() ?? '') &&
            existingSale.currency === currency &&
            existingSale.source.sourceType === input.source.sourceType &&
            existingSale.source.sourceId === input.source.sourceId.trim();

          if (isMatchingRetry) {
            return SalesApplicationResult.ok(SaleMapper.toDTO(existingSale));
          }

          return SalesApplicationResult.fail(
            new DuplicateSaleException(
              `A Sale with ID '${effectiveId}' already exists with different transaction parameters.`,
              existingSale.id.value,
              existingSale.tenantId,
            ),
          );
        }
      }

      // 2. Operational Single-Billing Entity Invariant: TreatmentSession must be billed at most once
      if (
        input.source.sourceType === SourceType.TREATMENT_SESSION &&
        this.saleRepository.findBySourceReference
      ) {
        const existingForSession = await this.saleRepository.findBySourceReference(
          input.source.sourceType,
          input.source.sourceId.trim(),
          input.tenantId,
        );

        if (existingForSession) {
          if (effectiveId && existingForSession.id.value === effectiveId) {
            return SalesApplicationResult.ok(SaleMapper.toDTO(existingForSession));
          }

          return SalesApplicationResult.fail(
            new DuplicateSaleException(
              `An active Sale ('${existingForSession.id.value}') already exists for TreatmentSession '${input.source.sourceId}'. Duplicate sale creation is prohibited.`,
              existingForSession.id.value,
              input.tenantId,
            ),
          );
        }
      }

      // 3. External Order Reference Uniqueness: sourceCode (non-generic POS terminal tag)
      if (input.source.sourceCode && this.saleRepository.findBySourceCode) {
        const trimmedCode = input.source.sourceCode.trim();
        if (trimmedCode !== 'POS_REGISTER' && trimmedCode !== 'pos_checkout_terminal') {
          const existingForCode = await this.saleRepository.findBySourceCode(
            trimmedCode,
            input.tenantId,
          );

          if (existingForCode) {
            if (effectiveId && existingForCode.id.value === effectiveId) {
              return SalesApplicationResult.ok(SaleMapper.toDTO(existingForCode));
            }

            const isMatch =
              (existingForCode.tenantId ?? '') === (input.tenantId?.trim() ?? '') &&
              (existingForCode.clientId ?? '') === (input.clientId?.trim() ?? '') &&
              existingForCode.currency === currency &&
              existingForCode.source.sourceId === input.source.sourceId.trim();

            if (isMatch) {
              return SalesApplicationResult.ok(SaleMapper.toDTO(existingForCode));
            }

            return SalesApplicationResult.fail(
              new DuplicateSaleException(
                `An active Sale ('${existingForCode.id.value}') already exists with order reference '${trimmedCode}'. Duplicate sale creation is prohibited.`,
                existingForCode.id.value,
                input.tenantId,
              ),
            );
          }
        }
      }

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
          id: effectiveId ? SaleId.create(effectiveId) : undefined,
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
