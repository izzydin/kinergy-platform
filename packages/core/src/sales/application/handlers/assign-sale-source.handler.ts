import { SalesCommandHandler } from '../shared/sales-command-handler.interface';
import { SalesApplicationResult } from '../shared/sales-application-result';
import { AssignSaleSourceCommand } from '../commands/assign-sale-source.command';
import { SaleDTO } from '../dtos/sale.dto';
import { SaleMapper } from '../mappers/sale.mapper';
import { SaleSource } from '../../domain/value-objects/sale-source.vo';
import { SourceReference } from '../../domain/value-objects/source-reference.vo';
import { SourceType, isValidSourceType } from '../../domain/enums/source-type.enum';
import { SaleSourceType, isValidSaleSourceType } from '../../domain/enums/sale-source-type.enum';
import { InvalidSaleSourceException } from '../../domain/exceptions/invalid-sale-source.exception';
import { SaleNotFoundException } from '../exceptions/sale-not-found.exception';
import { SourceNotFoundException } from '../exceptions/source-not-found.exception';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { SaleSourceValidatorPort } from '../ports/sale-source-validator.port';

/**
 * Application command handler to assign or update the commercial origin of an existing Sale.
 * Validates request structure, rejects unsupported source types, validates upstream existence
 * via SaleSourceValidatorPort (if configured), and delegates lifecycle invariant enforcement
 * to the Sale Aggregate root (which enforces immutability under ADR-0121 §4.9).
 */
export class AssignSaleSourceHandler implements SalesCommandHandler<
  AssignSaleSourceCommand,
  SalesApplicationResult<SaleDTO>
> {
  constructor(
    private readonly saleRepository: SaleRepositoryPort,
    private readonly sourceValidator?: SaleSourceValidatorPort,
  ) {}

  public async execute(command: AssignSaleSourceCommand): Promise<SalesApplicationResult<SaleDTO>> {
    try {
      if (!command || !command.input) {
        return SalesApplicationResult.fail(
          new InvalidSaleSourceException(
            'AssignSaleSourceCommand input cannot be null or undefined.',
          ),
        );
      }

      const { input } = command;

      // 1. Request Structure Validation
      if (!input.saleId || typeof input.saleId !== 'string' || input.saleId.trim() === '') {
        return SalesApplicationResult.fail(
          new InvalidSaleSourceException(
            'SaleId is required and cannot be empty.',
            'INVALID_SALE_ID',
          ),
        );
      }

      if (!input.source) {
        return SalesApplicationResult.fail(
          new InvalidSaleSourceException(
            'SaleSource reference is required.',
            'MISSING_SOURCE_REFERENCE',
          ),
        );
      }

      if (
        !input.source.sourceId ||
        typeof input.source.sourceId !== 'string' ||
        input.source.sourceId.trim() === ''
      ) {
        return SalesApplicationResult.fail(
          new InvalidSaleSourceException(
            'Reference ID is required and cannot be empty or whitespace.',
            'INVALID_SALE_SOURCE_REFERENCE_ID',
          ),
        );
      }

      // 2. Reject unsupported source types before persistence
      const rawSourceType = input.source.sourceType;
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

      // 3. Load existing Sale aggregate
      const sale = await this.saleRepository.findById(input.saleId.trim());
      if (!sale) {
        return SalesApplicationResult.fail(new SaleNotFoundException(input.saleId.trim()));
      }

      // 4. Source Existence & Context Validation (if configured)
      if (this.sourceValidator) {
        const validation = await this.sourceValidator.validateSource({
          sourceType: rawSourceType,
          sourceId: input.source.sourceId.trim(),
          sourceCode: input.source.sourceCode?.trim() ?? null,
          tenantId: sale.tenantId,
          expectedContext: input.expectedContext,
        });

        if (!validation.exists) {
          return SalesApplicationResult.fail(
            new SourceNotFoundException(
              validation.errorMessage ??
                `Source entity '${input.source.sourceId}' of type '${String(rawSourceType)}' was not found in upstream domain.`,
              String(rawSourceType),
              input.source.sourceId.trim(),
            ),
          );
        }

        if (validation.belongsToContext === false) {
          return SalesApplicationResult.fail(
            new InvalidSaleSourceException(
              validation.errorMessage ??
                `Source entity '${input.source.sourceId}' belongs to '${validation.actualContext ?? 'another'}' context, not '${input.expectedContext ?? String(rawSourceType)}'.`,
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

      // 5. Construct SaleSource Value Object
      let source: SaleSource | SourceReference;
      if (isSaleSourceType) {
        source = SaleSource.create(rawSourceType as SaleSourceType, input.source.sourceId.trim());
      } else {
        source = SourceReference.create({
          sourceType: rawSourceType as SourceType,
          sourceId: input.source.sourceId.trim(),
          sourceCode: input.source.sourceCode?.trim() ?? null,
        });
      }

      // 6. Aggregate Invariant Enforcement (Prohibits modification under ADR-0121 §4.9)
      sale.assignSource(source);

      // 7. Persist atomically
      await this.saleRepository.save(sale);
      return SalesApplicationResult.ok(SaleMapper.toDTO(sale));
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      return SalesApplicationResult.fail(error);
    }
  }
}
