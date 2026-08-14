import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateRecurrenceSeriesRequestDto,
  SkipOccurrenceRequestDto,
  EditSingleOccurrenceRequestDto,
  EditFutureOccurrencesRequestDto,
  CancelRecurrenceSeriesRequestDto,
} from '../index';
import { RecurrenceFrequency } from '@kinergy-platform/core';

describe('Recurring Appointments DTO Validation Tests', () => {
  describe('CreateRecurrenceSeriesRequestDto Validation', () => {
    it('passes validation when valid fields are supplied', async () => {
      const dto = plainToInstance(CreateRecurrenceSeriesRequestDto, {
        clientId: 'client_val_1',
        therapistId: 'therapist_val_1',
        roomId: 'room_val_1',
        serviceType: 'TREATMENT',
        frequency: RecurrenceFrequency.WEEKLY,
        startDate: '2026-09-01T09:00:00.000Z',
        endDate: '2026-12-31T23:59:59.999Z',
        maxOccurrences: 12,
        localStartTime: { hour: 9, minute: 30 },
        durationMinutes: 60,
        timezone: 'America/New_York',
        horizonDays: 60,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('fails validation when mandatory fields are missing or out of bounds', async () => {
      const dto = plainToInstance(CreateRecurrenceSeriesRequestDto, {
        clientId: '',
        therapistId: 't1',
        roomId: 'r1',
        serviceType: '',
        frequency: 'INVALID_FREQ' as unknown as RecurrenceFrequency,
        startDate: 'not-a-date',
        localStartTime: { hour: 25, minute: 61 },
        durationMinutes: 10, // Below 15
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const propertyNames = errors.map((e) => e.property);
      expect(propertyNames).toContain('clientId');
      expect(propertyNames).toContain('serviceType');
      expect(propertyNames).toContain('frequency');
      expect(propertyNames).toContain('startDate');
      expect(propertyNames).toContain('localStartTime');
      expect(propertyNames).toContain('durationMinutes');
    });
  });

  describe('SkipOccurrenceRequestDto Validation', () => {
    it('passes with non-negative occurrence index', async () => {
      const dto = plainToInstance(SkipOccurrenceRequestDto, {
        occurrenceIndex: 2,
        reason: 'Client vacation',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('fails with negative occurrence index', async () => {
      const dto = plainToInstance(SkipOccurrenceRequestDto, {
        occurrenceIndex: -1,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]!.property).toBe('occurrenceIndex');
    });
  });

  describe('EditSingleOccurrenceRequestDto Validation', () => {
    it('passes with valid optional fields', async () => {
      const dto = plainToInstance(EditSingleOccurrenceRequestDto, {
        newStartTime: '2026-09-15T14:00:00.000Z',
        newDurationMinutes: 90,
        newTherapistId: 't2',
        newRoomId: 'r2',
        rescheduleReason: 'Afternoon request',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('fails with invalid duration range', async () => {
      const dto = plainToInstance(EditSingleOccurrenceRequestDto, {
        newDurationMinutes: 300, // Exceeds 240
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]!.property).toBe('newDurationMinutes');
    });
  });

  describe('EditFutureOccurrencesRequestDto Validation', () => {
    it('passes with valid cutoff date and future params', async () => {
      const dto = plainToInstance(EditFutureOccurrencesRequestDto, {
        cutoffDate: '2026-10-01T00:00:00.000Z',
        newFrequency: RecurrenceFrequency.BIWEEKLY,
        newLocalStartTime: { hour: 11, minute: 0 },
        newDurationMinutes: 90,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('fails when cutoffDate is not ISO 8601', async () => {
      const dto = plainToInstance(EditFutureOccurrencesRequestDto, {
        cutoffDate: 'invalid-date',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]!.property).toBe('cutoffDate');
    });
  });

  describe('CancelRecurrenceSeriesRequestDto Validation', () => {
    it('passes with optional reason', async () => {
      const dto = plainToInstance(CancelRecurrenceSeriesRequestDto, {
        reason: 'Treatment course completed',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });
});
