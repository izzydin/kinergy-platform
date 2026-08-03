import { Appointment } from '../../../domain/appointment/appointment.aggregate';
import {
  AppointmentType,
  AppointmentTypeEnum,
} from '../../../domain/value-objects/appointment-type.vo';
import { TimeRange } from '../../../domain/value-objects/time-range.vo';
import { AppointmentMapper } from './appointment.mapper';

describe('AppointmentMapper', () => {
  const apptType = AppointmentType.create(AppointmentTypeEnum.ASSESSMENT);
  const timeRange = TimeRange.create(
    new Date('2026-08-03T10:00:00.000Z'),
    new Date('2026-08-03T11:00:00.000Z'),
  );

  it('should map Appointment aggregate root to AppointmentDTO correctly', () => {
    const appointment = Appointment.create({
      clientId: 'client_100',
      therapistId: 'therapist_200',
      roomId: 'room_300',
      type: apptType,
      timeRange,
    });

    const dto = AppointmentMapper.toDTO(appointment);

    expect(dto.id).toBe(appointment.id.getValue());
    expect(dto.status).toBe('SCHEDULED');
    expect(dto.type).toBe('ASSESSMENT');
    expect(dto.clientId).toBe('client_100');
    expect(dto.therapistId).toBe('therapist_200');
    expect(dto.roomId).toBe('room_300');
    expect(dto.startTime).toBe('2026-08-03T10:00:00.000Z');
    expect(dto.endTime).toBe('2026-08-03T11:00:00.000Z');
    expect(dto.durationMinutes).toBe(60);
    expect(dto.version).toBe(1);
    expect(dto.createdAt).toBeDefined();
    expect(dto.updatedAt).toBeDefined();
  });

  it('should map list of Appointment aggregates to array of AppointmentDTOs', () => {
    const appt1 = Appointment.create({
      clientId: 'client_1',
      therapistId: 'therapist_1',
      roomId: 'room_1',
      type: apptType,
      timeRange,
    });
    const appt2 = Appointment.create({
      clientId: 'client_2',
      therapistId: 'therapist_2',
      roomId: 'room_2',
      type: apptType,
      timeRange,
    });

    const dtos = AppointmentMapper.toDTOList([appt1, appt2]);

    expect(dtos).toHaveLength(2);
    expect(dtos[0]?.clientId).toBe('client_1');
    expect(dtos[1]?.clientId).toBe('client_2');
  });
});
