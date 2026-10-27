import { Injectable, Optional } from '@nestjs/common';
import {
  SaleSourceValidatorPort,
  ValidateSourceInput,
  SaleSourceValidationResult,
  SaleSourceType,
  SourceType,
} from '@kinergy-platform/core';
import { KinesiologySourceValidatorAdapter } from './kinesiology-source-validator.adapter';
import { GymSourceValidatorAdapter } from './gym-source-validator.adapter';
import { ResourcesSourceValidatorAdapter } from './resources-source-validator.adapter';
import { SchedulingRoomSourceValidatorAdapter } from './scheduling-room-source-validator.adapter';

/**
 * Composite Adapter implementing SaleSourceValidatorPort.
 * Dispatches source validation and commercial detail resolution to specialized domain adapters.
 * Adheres strictly to Clean Architecture, DDD, and ADR-0139.
 */
@Injectable()
export class CompositeSaleSourceValidatorAdapter implements SaleSourceValidatorPort {
  constructor(
    @Optional()
    private readonly kinesiologyAdapter?: KinesiologySourceValidatorAdapter,
    @Optional()
    private readonly gymAdapter?: GymSourceValidatorAdapter,
    @Optional()
    private readonly resourcesAdapter?: ResourcesSourceValidatorAdapter,
    @Optional()
    private readonly schedulingRoomAdapter?: SchedulingRoomSourceValidatorAdapter,
  ) {}

  public async validateSource(input: ValidateSourceInput): Promise<SaleSourceValidationResult> {
    if (!input || !input.sourceType || !input.sourceId) {
      return {
        isValid: false,
        exists: false,
        errorMessage: 'Invalid source input: sourceType and sourceId are required.',
      };
    }

    const rawType = String(input.sourceType).toUpperCase();

    // 1. Kinesiology Context
    if (
      rawType === SaleSourceType.KINESIOLOGY_SESSION ||
      rawType === SourceType.TREATMENT_SESSION ||
      rawType === 'KINESIOLOGY_SESSION' ||
      rawType === 'TREATMENT_SESSION'
    ) {
      if (!this.kinesiologyAdapter) {
        return {
          isValid: false,
          exists: false,
          errorMessage: 'Kinesiology validator adapter is not configured.',
        };
      }
      return this.kinesiologyAdapter.validate(input);
    }

    // 2. Gym Management Context
    if (
      rawType === SaleSourceType.GYM_MEMBERSHIP ||
      rawType === SourceType.MEMBERSHIP_PLAN ||
      rawType === 'GYM_MEMBERSHIP' ||
      rawType === 'MEMBERSHIP_PLAN'
    ) {
      if (!this.gymAdapter) {
        return {
          isValid: false,
          exists: false,
          errorMessage: 'Gym validator adapter is not configured.',
        };
      }
      return this.gymAdapter.validate(input);
    }

    // 3. Resources Management Context (Food / Drink)
    if (
      rawType === SaleSourceType.FOOD ||
      rawType === SaleSourceType.DRINK ||
      rawType === SourceType.INVENTORY_ITEM ||
      rawType === 'FOOD' ||
      rawType === 'DRINK' ||
      rawType === 'INVENTORY_ITEM'
    ) {
      if (!this.resourcesAdapter) {
        return {
          isValid: false,
          exists: false,
          errorMessage: 'Resources validator adapter is not configured.',
        };
      }
      return this.resourcesAdapter.validate(input);
    }

    // 4. Room Rental Context (Scheduling Domain)
    if (rawType === SaleSourceType.ROOM_RENTAL || rawType === 'ROOM_RENTAL') {
      if (!this.schedulingRoomAdapter) {
        return {
          isValid: false,
          exists: false,
          errorMessage: 'Scheduling room validator adapter is not configured.',
        };
      }
      return this.schedulingRoomAdapter.validate(input);
    }

    // 5. Unsupported Source Type
    return {
      isValid: false,
      exists: false,
      errorMessage: `Unsupported source type '${input.sourceType}'.`,
    };
  }
}
