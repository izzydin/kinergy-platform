import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  GetTreatmentSessionByIdHandler,
  GetTreatmentSessionByIdQuery,
  SessionStatus,
  SaleSourceType,
  SourceType,
} from '@kinergy-platform/core';
import {
  ValidateSourceInput,
  SaleSourceValidationResult,
  SourceCommercialDetails,
} from '@kinergy-platform/core';
import { ISchedulingAppointmentLookupPort } from '@kinergy-platform/core';
import { SCHEDULING_APPOINTMENT_LOOKUP_PORT_TOKEN } from '../../../kinesiology/kinesiology.tokens';

export interface KinesiologyFeeScheduleResolver {
  getServiceFeeCents(appointmentType?: string): number;
}

/**
 * Default fee resolver mapping appointment clinical service types to standard integer-cent rates.
 * Default clinical treatment rate: $80.00 (8000 cents).
 */
export class DefaultKinesiologyFeeScheduleResolver implements KinesiologyFeeScheduleResolver {
  private readonly rates: Record<string, number> = {
    ASSESSMENT: 12000, // $120.00
    TREATMENT: 8500, // $85.00
    FOLLOW_UP: 6500, // $65.00
    EVALUATION: 9500, // $95.00
  };

  public getServiceFeeCents(appointmentType?: string): number {
    if (!appointmentType) return 8000;
    return this.rates[appointmentType.toUpperCase()] ?? 8000;
  }
}

/**
 * Adapter validating clinical TreatmentSession commercial eligibility for Sales checkout.
 * Adheres strictly to ADR-0110, ADR-0121, and ADR-0139.
 */
@Injectable()
export class KinesiologySourceValidatorAdapter {
  private readonly feeResolver: KinesiologyFeeScheduleResolver;

  constructor(
    @Optional()
    private readonly getSessionByIdHandler?: GetTreatmentSessionByIdHandler,
    @Optional()
    @Inject(SCHEDULING_APPOINTMENT_LOOKUP_PORT_TOKEN)
    private readonly appointmentLookupPort?: ISchedulingAppointmentLookupPort,
    @Optional()
    feeResolver?: KinesiologyFeeScheduleResolver,
  ) {
    this.feeResolver = feeResolver ?? new DefaultKinesiologyFeeScheduleResolver();
  }

  public async validate(input: ValidateSourceInput): Promise<SaleSourceValidationResult> {
    const rawType = String(input.sourceType);
    const isKinesiology =
      rawType === SaleSourceType.KINESIOLOGY_SESSION ||
      rawType === SourceType.TREATMENT_SESSION ||
      rawType === 'KINESIOLOGY_SESSION' ||
      rawType === 'TREATMENT_SESSION';

    if (!isKinesiology) {
      return {
        isValid: false,
        exists: false,
        belongsToContext: false,
        actualContext: 'unknown',
        errorMessage: `Source type '${rawType}' is not managed by Kinesiology.`,
      };
    }

    const sessionId = input.sourceId.trim();
    if (!sessionId) {
      return {
        isValid: false,
        exists: false,
        belongsToContext: true,
        actualContext: 'kinesiology',
        errorMessage: 'Treatment session ID cannot be empty.',
      };
    }

    if (!this.getSessionByIdHandler) {
      return {
        isValid: false,
        exists: false,
        belongsToContext: true,
        actualContext: 'kinesiology',
        errorMessage: 'Kinesiology session query handler is not configured.',
      };
    }

    try {
      const query = new GetTreatmentSessionByIdQuery({ sessionId });
      const result = await this.getSessionByIdHandler.execute(query);

      if (result.isFailure) {
        return {
          isValid: false,
          exists: false,
          belongsToContext: true,
          actualContext: 'kinesiology',
          errorMessage: result.getError(),
        };
      }

      const session = result.getValue();

      // Lifecycle Invariant: Only COMPLETED sessions are billable (ADR-0139 §3.1)
      if (session.status !== SessionStatus.COMPLETED) {
        return {
          isValid: false,
          exists: true,
          belongsToContext: true,
          actualContext: 'kinesiology',
          errorMessage: `Treatment session '${sessionId}' is in '${session.status}' status. Only COMPLETED clinical sessions can be billed.`,
        };
      }

      // Authoritative Price Resolution via Appointment lookup (ADR-0139 §7)
      let feeCents = 8000; // $80.00 default treatment session rate
      if (this.appointmentLookupPort && session.appointmentId) {
        try {
          const apptRef = await this.appointmentLookupPort.getAppointmentReference(
            session.appointmentId,
          );
          if (apptRef) {
            feeCents = this.feeResolver.getServiceFeeCents(apptRef.serviceType ?? 'TREATMENT');
          }
        } catch {
          // Fall back gracefully to standard clinical session rate without dropping checkout
          feeCents = this.feeResolver.getServiceFeeCents();
        }
      }

      const commercialDetails: SourceCommercialDetails = {
        clientId: session.clientId,
        unitPriceCents: feeCents,
        currency: 'USD',
        description: `Clinical Kinesiology Session - Therapist ${session.therapistId}`,
        skuOrCode: session.appointmentId,
        version: session.version,
      };

      return {
        isValid: true,
        exists: true,
        belongsToContext: true,
        actualContext: 'kinesiology',
        commercialDetails,
      };
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Unexpected infrastructure failure during kinesiology validation.';
      return {
        isValid: false,
        exists: false,
        belongsToContext: true,
        actualContext: 'kinesiology',
        errorMessage: message,
      };
    }
  }
}
