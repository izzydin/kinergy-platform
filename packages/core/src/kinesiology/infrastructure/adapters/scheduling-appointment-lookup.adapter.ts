import { ISchedulingAppointmentLookupPort } from '../../application/ports/scheduling-appointment-lookup.port';
import { AppointmentReferenceDTO } from '../../application/dtos/appointment-reference.dto';
import { GetAppointmentByIdHandler } from '../../../scheduling/application/appointment/handlers/get-appointment-by-id.handler';
import { GetAppointmentByIdQuery } from '../../../scheduling/application/appointment/queries/get-appointment-by-id.query';

/**
 * Eligible clinical kinesiology appointment types.
 */
const CLINICAL_APPOINTMENT_TYPES = new Set(['ASSESSMENT', 'TREATMENT', 'FOLLOW_UP', 'EVALUATION']);

/**
 * Active appointment statuses permitted to initiate treatment sessions.
 */
const ACTIVE_APPOINTMENT_STATUSES = new Set([
  'SCHEDULED',
  'CONFIRMED',
  'CHECKED_IN',
  'IN_PROGRESS',
]);

/**
 * Anti-Corruption Layer (ACL) Adapter implementing ISchedulingAppointmentLookupPort
 * by delegating to Scheduling's GetAppointmentByIdHandler query use case.
 */
export class SchedulingAppointmentLookupAdapter implements ISchedulingAppointmentLookupPort {
  constructor(private readonly getAppointmentByIdHandler: GetAppointmentByIdHandler) {}

  /**
   * Translates an upstream Scheduling Appointment into an AppointmentReferenceDTO.
   */
  public async getAppointmentReference(
    appointmentId: string,
  ): Promise<AppointmentReferenceDTO | null> {
    try {
      const query = new GetAppointmentByIdQuery({ appointmentId });
      const queryResult = await this.getAppointmentByIdHandler.execute(query);

      if (!queryResult.isSuccess) {
        return null;
      }

      const appt = queryResult.getValue();

      // 1. Validate Clinical Type
      const isClinicalType = CLINICAL_APPOINTMENT_TYPES.has(appt.type.toUpperCase());

      // 2. Validate Active Status
      const isActiveStatus = ACTIVE_APPOINTMENT_STATUSES.has(appt.status.toUpperCase());

      let isEligible = true;
      let ineligibilityReason: string | undefined;

      if (!isClinicalType) {
        isEligible = false;
        ineligibilityReason = `Cannot create session: Appointment type '${appt.type}' is not a clinical kinesiology service.`;
      } else if (!isActiveStatus) {
        isEligible = false;
        ineligibilityReason = `Cannot create session: Appointment is in '${appt.status}' status.`;
      }

      return {
        appointmentId: appt.id,
        clientId: appt.clientId,
        therapistId: appt.therapistId,
        scheduledAt: new Date(appt.startTime),
        isEligibleForSession: isEligible,
        ineligibilityReason,
      };
    } catch {
      return null;
    }
  }
}
