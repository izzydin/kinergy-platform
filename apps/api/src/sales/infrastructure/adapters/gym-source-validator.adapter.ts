import { Injectable, Optional } from '@nestjs/common';
import {
  GetMembershipPlanByIdHandler,
  GetMembershipPlanByIdQuery,
  SaleSourceType,
  SourceType,
} from '@kinergy-platform/core';
import {
  ValidateSourceInput,
  SaleSourceValidationResult,
  SourceCommercialDetails,
} from '@kinergy-platform/core';

/**
 * Adapter validating gym membership plan commercial eligibility for Sales checkout.
 * Adheres strictly to ADR-0110, ADR-0121, and ADR-0139.
 */
@Injectable()
export class GymSourceValidatorAdapter {
  constructor(
    @Optional()
    private readonly getPlanByIdHandler?: GetMembershipPlanByIdHandler,
  ) {}

  public async validate(input: ValidateSourceInput): Promise<SaleSourceValidationResult> {
    const rawType = String(input.sourceType);
    const isGym =
      rawType === SaleSourceType.GYM_MEMBERSHIP ||
      rawType === SourceType.MEMBERSHIP_PLAN ||
      rawType === 'GYM_MEMBERSHIP' ||
      rawType === 'MEMBERSHIP_PLAN';

    if (!isGym) {
      return {
        isValid: false,
        exists: false,
        belongsToContext: false,
        actualContext: 'unknown',
        errorMessage: `Source type '${rawType}' is not managed by Gym Management.`,
      };
    }

    const planId = input.sourceId.trim();
    if (!planId) {
      return {
        isValid: false,
        exists: false,
        belongsToContext: true,
        actualContext: 'gym',
        errorMessage: 'Membership plan ID cannot be empty.',
      };
    }

    if (!this.getPlanByIdHandler) {
      return {
        isValid: false,
        exists: false,
        belongsToContext: true,
        actualContext: 'gym',
        errorMessage: 'Gym plan query handler is not configured.',
      };
    }

    try {
      const query = new GetMembershipPlanByIdQuery({ planId });
      const result = await this.getPlanByIdHandler.execute(query);

      if (result.isFailure) {
        return {
          isValid: false,
          exists: false,
          belongsToContext: true,
          actualContext: 'gym',
          errorMessage: result.getError(),
        };
      }

      const plan = result.getValue();

      // Lifecycle Invariant: Only ACTIVE plans can be sold (ADR-0139 §3.2)
      if (plan.status.toUpperCase() !== 'ACTIVE') {
        return {
          isValid: false,
          exists: true,
          belongsToContext: true,
          actualContext: 'gym',
          errorMessage: `Membership plan '${plan.name}' is in '${plan.status}' status. Only ACTIVE plans can be sold.`,
        };
      }

      // Authoritative Price Resolution from plan catalog (converted to integer cents)
      const unitPriceCents = Math.round(Number(plan.priceAmount) * 100);

      const commercialDetails: SourceCommercialDetails = {
        unitPriceCents,
        currency: plan.priceCurrency || 'USD',
        description: `Gym Membership - ${plan.name}`,
        skuOrCode: plan.code,
        version: plan.version,
      };

      return {
        isValid: true,
        exists: true,
        belongsToContext: true,
        actualContext: 'gym',
        commercialDetails,
      };
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Unexpected infrastructure failure during gym validation.';
      return {
        isValid: false,
        exists: false,
        belongsToContext: true,
        actualContext: 'gym',
        errorMessage: message,
      };
    }
  }
}
