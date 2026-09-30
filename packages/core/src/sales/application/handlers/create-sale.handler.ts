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
import { SaleSource } from '../../domain/value-objects/sale-source.vo';
import { SourceType, isValidSourceType } from '../../domain/enums/source-type.enum';
import { SaleSourceType, isValidSaleSourceType } from '../../domain/enums/sale-source-type.enum';
import { DuplicateSaleException } from '../../domain/exceptions/duplicate-sale.exception';
import { InvalidSaleSourceException } from '../../domain/exceptions/invalid-sale-source.exception';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { SalesEventPublisherPort } from '../ports/sales-event-publisher.port';
import { SaleSourceValidatorPort } from '../ports/sale-source-validator.port';
import { SourceNotFoundException } from '../exceptions/source-not-found.exception';
import { Clock, SystemClock } from '../../domain/shared/clock';

export class CreateSaleHandler implements SalesCommandHandler<
  CreateSaleCommand,
  SalesApplicationResult<SaleDTO>
> {
  constructor(
    private readonly saleRepository: SaleRepositoryPort,
    private readonly clock: Clock = new SystemClock(),
    private readonly eventPublisher?: SalesEventPublisherPort,
    private readonly sourceValidator?: SaleSourceValidatorPort,
  ) {}

  public async execute(command: CreateSaleCommand): Promise<SalesApplicationResult<SaleDTO>> {
    try {
      if (!command || !command.input) {
        return SalesApplicationResult.fail(
          new InvalidSaleSourceException('CreateSaleCommand input cannot be null or undefined.'),
        );
      }

      const { input } = command;

      // 1. Request Structure & Source Reference Validation
      let sourceInput = input.source;
      if (!sourceInput) {
        if (input.allowWalkInWithoutSource === true) {
          // Permitted walk-in retail origin: Default to standardized POS terminal origin
          sourceInput = {
            sourceType: SaleSourceType.DRINK,
            sourceId: 'pos_checkout_terminal',
            sourceCode: 'POS_REGISTER',
          };
        } else {
          return SalesApplicationResult.fail(
            new InvalidSaleSourceException(
              'SaleSource reference is required. To create a walk-in sale without an upstream source, set allowWalkInWithoutSource to true.',
              'MISSING_SOURCE_REFERENCE',
            ),
          );
        }
      }

      if (
        !sourceInput.sourceId ||
        typeof sourceInput.sourceId !== 'string' ||
        sourceInput.sourceId.trim().length === 0
      ) {
        return SalesApplicationResult.fail(
          new InvalidSaleSourceException(
            'Reference ID is required and cannot be empty or whitespace.',
            'INVALID_SALE_SOURCE_REFERENCE_ID',
          ),
        );
      }

      // 2. Reject unsupported source types before persistence
      const rawSourceType = sourceInput.sourceType;
      const isSaleSourceType = isValidSaleSourceType(rawSourceType);
      const isLegacySourceType = isValidSourceType(rawSourceType);

      if (!isSaleSourceType && !isLegacySourceType) {
        return SalesApplicationResult.fail(
          new InvalidSaleSourceException(
            `Invalid or unsupported source type: '${String(rawSourceType)}'. Supported types are: ${Object.values(SaleSourceType).join(', ')}.`,
            'UNSUPPORTED_SALE_SOURCE_TYPE',
          ),
        );
      }

      // 3. Source Existence & Context Ownership Validation (if configured)
      if (this.sourceValidator) {
        const validation = await this.sourceValidator.validateSource({
          sourceType: rawSourceType,
          sourceId: sourceInput.sourceId.trim(),
          sourceCode: sourceInput.sourceCode?.trim() ?? null,
          tenantId: input.tenantId?.trim(),
          expectedContext: input.expectedContext,
        });

        if (!validation.exists) {
          return SalesApplicationResult.fail(
            new SourceNotFoundException(
              validation.errorMessage ??
                `Source entity '${sourceInput.sourceId}' of type '${String(rawSourceType)}' was not found in upstream domain.`,
              String(rawSourceType),
              sourceInput.sourceId.trim(),
            ),
          );
        }

        if (validation.belongsToContext === false) {
          return SalesApplicationResult.fail(
            new InvalidSaleSourceException(
              validation.errorMessage ??
                `Source entity '${sourceInput.sourceId}' belongs to '${validation.actualContext ?? 'another'}' context, not '${input.expectedContext ?? String(rawSourceType)}'.`,
              'SOURCE_CONTEXT_MISMATCH',
            ),
          );
        }

        if (!validation.isValid) {
          return SalesApplicationResult.fail(
            new InvalidSaleSourceException(
              validation.errorMessage ?? 'Upstream source entity validation failed.',
              'SOURCE_VALIDATION_FAILED',
            ),
          );
        }
      }

      const currency = input.currency
        ? input.currency.trim().toUpperCase()
        : Money.DEFAULT_CURRENCY;

      const effectiveId = input.id?.trim() || input.idempotencyKey?.trim();

      // 4. Idempotency Check: Caller-supplied transaction identity
      if (effectiveId) {
        const existingSale = await this.saleRepository.findById(effectiveId);
        if (existingSale) {
          const isMatchingRetry =
            (existingSale.tenantId ?? '') === (input.tenantId?.trim() ?? '') &&
            (existingSale.clientId ?? '') === (input.clientId?.trim() ?? '') &&
            existingSale.currency === currency &&
            existingSale.source.sourceType === sourceInput.sourceType &&
            existingSale.source.sourceId === sourceInput.sourceId.trim();

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

      // 5. Operational Single-Billing Entity Invariant: Clinical session must be billed at most once
      const isClinicalSession =
        sourceInput.sourceType === SourceType.TREATMENT_SESSION ||
        (sourceInput.sourceType as unknown) === 'KINESIOLOGY_SESSION' ||
        (sourceInput.sourceType as unknown) === 'TREATMENT_SESSION';

      if (isClinicalSession && this.saleRepository.findBySourceReference) {
        const existingForSession = await this.saleRepository.findBySourceReference(
          sourceInput.sourceType,
          sourceInput.sourceId.trim(),
          input.tenantId,
        );

        if (existingForSession) {
          if (effectiveId && existingForSession.id.value === effectiveId) {
            return SalesApplicationResult.ok(SaleMapper.toDTO(existingForSession));
          }

          const sessionLabel =
            sourceInput.sourceType === SourceType.TREATMENT_SESSION
              ? 'TreatmentSession'
              : sourceInput.sourceType;

          return SalesApplicationResult.fail(
            new DuplicateSaleException(
              `An active Sale ('${existingForSession.id.value}') already exists for ${sessionLabel} '${sourceInput.sourceId}'. Duplicate sale creation is prohibited.`,
              existingForSession.id.value,
              input.tenantId,
            ),
          );
        }
      }

      // 6. External Order Reference Uniqueness: sourceCode (non-generic POS terminal tag)
      if (sourceInput.sourceCode && this.saleRepository.findBySourceCode) {
        const trimmedCode = sourceInput.sourceCode.trim();
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
              existingForCode.source.sourceId === sourceInput.sourceId.trim();

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

      let source: SaleSource | SourceReference;
      if (isSaleSourceType) {
        source = SaleSource.create(rawSourceType as SaleSourceType, sourceInput.sourceId.trim());
      } else {
        source = SourceReference.create({
          sourceType: rawSourceType as SourceType,
          sourceId: sourceInput.sourceId.trim(),
          sourceCode: sourceInput.sourceCode?.trim() ?? null,
        });
      }

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
