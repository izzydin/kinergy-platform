import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateRecurrenceSeriesRequestDto,
  SkipOccurrenceRequestDto,
  EditSingleOccurrenceRequestDto,
  EditFutureOccurrencesRequestDto,
  CancelRecurrenceSeriesRequestDto,
  CreateRecurrenceSeriesSchema,
  SkipOccurrenceSchema,
  EditSingleOccurrenceSchema,
  EditFutureOccurrencesSchema,
  CancelRecurrenceSeriesSchema,
} from '../index';
import { RecurrenceFrequency } from '@kinergy-platform/core';

describe('Recurring Appointments DTO Validation Tests', () => {
  describe('CreateRecurrenceSeriesRequestDto & Zod Schema Validation', () => {
    const validData = {
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
    };

    it('passes class-validator when valid fields are supplied', async () => {
      const dto = plainToInstance(CreateRecurrenceSeriesRequestDto, validData);
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('passes Zod schema validation when valid fields are supplied', () => {
      const parseResult = CreateRecurrenceSeriesSchema.safeParse(validData);
      expect(parseResult.success).toBe(true);
    });

    it('fails class-validator when mandatory fields are missing or out of bounds', async () => {
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

    it('fails Zod schema validation when duration or start time is out of bounds', () => {
      const parseResult = CreateRecurrenceSeriesSchema.safeParse({
        ...validData,
        durationMinutes: 5,
        localStartTime: { hour: 25, minute: 0 },
      });
      expect(parseResult.success).toBe(false);
    });
  });

  describe('SkipOccurrenceRequestDto & Zod Schema Validation', () => {
    it('passes with non-negative occurrence index', async () => {
      const dto = plainToInstance(SkipOccurrenceRequestDto, {
        occurrenceIndex: 2,
        reason: 'Client vacation',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(
        SkipOccurrenceSchema.safeParse({ occurrenceIndex: 2, reason: 'Client vacation' }).success,
      ).toBe(true);
    });

    it('fails with negative occurrence index', async () => {
      const dto = plainToInstance(SkipOccurrenceRequestDto, {
        occurrenceIndex: -1,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]!.property).toBe('occurrenceIndex');
      expect(SkipOccurrenceSchema.safeParse({ occurrenceIndex: -1 }).success).toBe(false);
    });
  });

  describe('EditSingleOccurrenceRequestDto & Zod Schema Validation', () => {
    it('passes with valid optional fields', async () => {
      const payload = {
        newStartTime: '2026-09-15T14:00:00.000Z',
        newDurationMinutes: 90,
        newTherapistId: 't2',
        newRoomId: 'r2',
        rescheduleReason: 'Afternoon request',
      };
      const dto = plainToInstance(EditSingleOccurrenceRequestDto, payload);

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(EditSingleOccurrenceSchema.safeParse(payload).success).toBe(true);
    });

    it('fails with invalid duration range', async () => {
      const dto = plainToInstance(EditSingleOccurrenceRequestDto, {
        newDurationMinutes: 300, // Exceeds 240
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]!.property).toBe('newDurationMinutes');
      expect(EditSingleOccurrenceSchema.safeParse({ newDurationMinutes: 300 }).success).toBe(false);
    });
  });

  describe('EditFutureOccurrencesRequestDto & Zod Schema Validation', () => {
    it('passes with valid cutoff date and future params', async () => {
      const payload = {
        cutoffDate: '2026-10-01T00:00:00.000Z',
        newFrequency: RecurrenceFrequency.BIWEEKLY,
        newLocalStartTime: { hour: 11, minute: 0 },
        newDurationMinutes: 90,
      };
      const dto = plainToInstance(EditFutureOccurrencesRequestDto, payload);

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(EditFutureOccurrencesSchema.safeParse(payload).success).toBe(true);
    });

    it('fails when cutoffDate is empty or invalid', async () => {
      const dto = plainToInstance(EditFutureOccurrencesRequestDto, {
        cutoffDate: 'invalid-date',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]!.property).toBe('cutoffDate');
    });
  });

  describe('CancelRecurrenceSeriesRequestDto & Zod Schema Validation', () => {
    it('passes with optional reason', async () => {
      const dto = plainToInstance(CancelRecurrenceSeriesRequestDto, {
        reason: 'Treatment course completed',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(
        CancelRecurrenceSeriesSchema.safeParse({ reason: 'Treatment course completed' }).success,
      ).toBe(true);
    });
  });
});
