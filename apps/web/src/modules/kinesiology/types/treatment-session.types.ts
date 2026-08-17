export type SessionStatusType = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export interface SoapNotesData {
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  rawText?: string;
}

export interface TreatmentSessionModel {
  id: string;
  clientId: string;
  therapistId: string;
  appointmentId: string;
  status: SessionStatusType;
  cancellationReason?: string;
  notes: SoapNotesData;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSessionPayload {
  appointmentId: string;
  initialNotes?: string;
  autoStart?: boolean;
}

export interface AssignTherapistPayload {
  newTherapistId: string;
}

export interface UpdateNotesPayload {
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  rawText?: string;
}

export interface CancelSessionPayload {
  reason: string;
}
