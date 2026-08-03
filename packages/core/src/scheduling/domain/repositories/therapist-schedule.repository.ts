import { TherapistSchedule } from '../therapist-schedule/therapist-schedule.aggregate';

export interface TherapistScheduleRepository {
  findByTherapistId(therapistId: string): Promise<TherapistSchedule | null>;
  save(schedule: TherapistSchedule): Promise<void>;
}
