import { Injectable, Optional } from '@nestjs/common';
import {
  GetRoomHandler,
  GetRoomQuery,
  SaleSourceType,
  ValidateSourceInput,
  SaleSourceValidationResult,
  SourceCommercialDetails,
  RoomStatus,
} from '@kinergy-platform/core';
import { ISchedulingRoomLookupPort } from '@kinergy-platform/core';

/**
 * Adapter validating Room Rental commercial eligibility for Sales checkout.
 * Adheres strictly to ADR-0110, ADR-0121, and ADR-0139.
 */
@Injectable()
export class SchedulingRoomSourceValidatorAdapter {
  constructor(
    @Optional()
    private readonly getRoomHandler?: GetRoomHandler,
    @Optional()
    private readonly roomLookupPort?: ISchedulingRoomLookupPort,
  ) {}

  public async validate(input: ValidateSourceInput): Promise<SaleSourceValidationResult> {
    const rawType = String(input.sourceType);
    const isRoomRental = rawType === SaleSourceType.ROOM_RENTAL || rawType === 'ROOM_RENTAL';

    if (!isRoomRental) {
      return {
        isValid: false,
        exists: false,
        belongsToContext: false,
        actualContext: 'unknown',
        errorMessage: `Source type '${rawType}' is not managed by Scheduling.`,
      };
    }

    const roomId = input.sourceId?.trim();
    if (!roomId) {
      return {
        isValid: false,
        exists: false,
        belongsToContext: true,
        actualContext: 'scheduling',
        errorMessage: 'Room rental reference ID cannot be empty.',
      };
    }

    // 1. Decoupled port lookup if configured
    if (this.roomLookupPort) {
      try {
        const roomRef = await this.roomLookupPort.getRoomReference(roomId, input.tenantId);
        if (!roomRef) {
          return {
            isValid: false,
            exists: false,
            belongsToContext: true,
            actualContext: 'scheduling',
            errorMessage: `Room with id '${roomId}' was not found in scheduling context.`,
          };
        }

        if (!roomRef.isAvailableForRental) {
          return {
            isValid: false,
            exists: true,
            belongsToContext: true,
            actualContext: 'scheduling',
            errorMessage: `Room '${roomRef.name}' is currently under maintenance and cannot be rented.`,
          };
        }

        const commercialDetails: SourceCommercialDetails = {
          unitPriceCents: roomRef.hourlyRateCents,
          currency: roomRef.currency || 'USD',
          description: `Room Rental - ${roomRef.name} (Capacity: ${roomRef.capacity})`,
          skuOrCode: roomRef.id,
          version: roomRef.version,
        };

        return {
          isValid: true,
          exists: true,
          belongsToContext: true,
          actualContext: 'scheduling',
          commercialDetails,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to query room reference.';
        return {
          isValid: false,
          exists: false,
          belongsToContext: true,
          actualContext: 'scheduling',
          errorMessage: message,
        };
      }
    }

    // 2. Direct query use-case handler lookup
    if (this.getRoomHandler) {
      try {
        const query = new GetRoomQuery({ roomId });
        const result = await this.getRoomHandler.execute(query);

        if (result.isFailure) {
          return {
            isValid: false,
            exists: false,
            belongsToContext: true,
            actualContext: 'scheduling',
            errorMessage: result.getError(),
          };
        }

        const room = result.getValue();

        // Lifecycle Invariant: Only AVAILABLE rooms can be rented
        const isAvailable =
          room.status === RoomStatus.AVAILABLE ||
          room.status.toUpperCase() === 'AVAILABLE' ||
          room.status.toUpperCase() === 'ACTIVE';

        if (!isAvailable) {
          return {
            isValid: false,
            exists: true,
            belongsToContext: true,
            actualContext: 'scheduling',
            errorMessage: `Room '${room.name}' is currently under maintenance and cannot be rented.`,
          };
        }

        // Standard hourly room rate: $60.00 / 6000 cents
        const unitPriceCents = 6000;

        const commercialDetails: SourceCommercialDetails = {
          unitPriceCents,
          currency: 'USD',
          description: `Room Rental - ${room.name} (Capacity: ${room.capacity})`,
          skuOrCode: room.id,
          version: room.version,
        };

        return {
          isValid: true,
          exists: true,
          belongsToContext: true,
          actualContext: 'scheduling',
          commercialDetails,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to retrieve room.';
        return {
          isValid: false,
          exists: false,
          belongsToContext: true,
          actualContext: 'scheduling',
          errorMessage: message,
        };
      }
    }

    return {
      isValid: false,
      exists: false,
      belongsToContext: true,
      actualContext: 'scheduling',
      errorMessage: 'Scheduling room validator adapter is not configured.',
    };
  }
}
