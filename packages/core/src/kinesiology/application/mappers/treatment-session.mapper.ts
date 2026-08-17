import { TreatmentSession } from '../../domain/treatment-session/treatment-session.aggregate';
import { TreatmentSessionDTO } from '../dtos/treatment-session.dto';

/**
 * Mapper transforming TreatmentSession aggregate instances into DTOs.
 */
export class TreatmentSessionMapper {
  /**
   * Converts a domain TreatmentSession aggregate to a TreatmentSessionDTO.
   */
  public static toDTO(session: TreatmentSession): TreatmentSessionDTO {
    const rawNotes = session.notes;

    return {
      id: session.id.getValue(),
      version: session.version,
      status: session.status,
      clientId: session.clientId,
      therapistId: session.therapistId,
      appointmentId: session.appointmentId,
      cancellationReason: session.cancellationReason,
      notes: {
        subjective: rawNotes.getSubjective(),
        objective: rawNotes.getObjective(),
        assessment: rawNotes.getAssessment(),
        plan: rawNotes.getPlan(),
        rawText: rawNotes.getRawText(),
      },
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    };
  }
}
