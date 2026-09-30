import { SaleSourceType } from '../../domain/enums/sale-source-type.enum';
import { SourceType } from '../../domain/enums/source-type.enum';

export interface ValidateSourceInput {
  readonly sourceType: SaleSourceType | SourceType | string;
  readonly sourceId: string;
  readonly sourceCode?: string | null;
  readonly tenantId?: string;
  readonly expectedContext?: string;
}

export interface SaleSourceValidationResult {
  readonly isValid: boolean;
  readonly exists: boolean;
  readonly belongsToContext?: boolean;
  readonly actualContext?: string;
  readonly errorMessage?: string;
}

/**
 * Port interface for validating source entity existence and ownership across bounded contexts.
 * Adheres to ADR-0121: Sales application layer coordinates with upstream domains via ports
 * without creating aggregate-to-repository dependencies.
 */
export interface SaleSourceValidatorPort {
  /**
   * Validates whether the source reference exists in its respective upstream domain,
   * matches tenant/context ownership, and is in a valid state for commercial checkout.
   */
  validateSource(input: ValidateSourceInput): Promise<SaleSourceValidationResult>;
}
