import { SaleSourceType } from '../../domain/enums/sale-source-type.enum';
import { SourceType } from '../../domain/enums/source-type.enum';

export interface ValidateSourceInput {
  readonly sourceType: SaleSourceType | SourceType | string;
  readonly sourceId: string;
  readonly sourceCode?: string | null;
  readonly tenantId?: string;
  readonly expectedContext?: string;
  readonly requestedQuantity?: number;
}

/**
 * Authoritative commercial snapshot resolved from upstream source domain.
 * Enforces ADR-0139: client, price in integer cents, description, and currency are source-authoritative.
 */
export interface SourceCommercialDetails {
  readonly clientId?: string | null;
  readonly unitPriceCents?: number;
  readonly currency?: string;
  readonly description?: string;
  readonly skuOrCode?: string | null;
  readonly version?: number;
}

export interface SaleSourceValidationResult {
  readonly isValid: boolean;
  readonly exists: boolean;
  readonly belongsToContext?: boolean;
  readonly actualContext?: string;
  readonly errorMessage?: string;
  readonly commercialDetails?: SourceCommercialDetails;
}

/**
 * Port interface for validating source entity existence, eligibility, and commercial details across bounded contexts.
 * Adheres to ADR-0121 & ADR-0139: Sales application layer coordinates with upstream domains via ports
 * without creating aggregate-to-repository dependencies.
 */
export interface SaleSourceValidatorPort {
  /**
   * Validates whether the source reference exists in its respective upstream domain,
   * matches tenant/context ownership, is in a valid state for commercial checkout,
   * and optionally resolves authoritative commercial details (price, currency, client).
   */
  validateSource(input: ValidateSourceInput): Promise<SaleSourceValidationResult>;
}
