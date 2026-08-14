import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RecurringAppointmentsController } from '../controllers/recurring-appointments.controller';
import {
  CreateRecurrenceSeriesHandler,
  SkipRecurrenceOccurrenceHandler,
  EditSingleOccurrenceHandler,
  EditFutureOccurrencesHandler,
  CancelRecurrenceSeriesHandler,
  ApplicationResult,
  RecurrenceFrequency,
  CreateRecurrenceSeriesResultDTO,
  AppointmentDTO,
} from '@kinergy-platform/core';

describe('RecurringAppointmentsController Unit & Flow Tests', () => {
  let controller: RecurringAppointmentsController;
  let mockCreateHandler: jest.Mocked<CreateRecurrenceSeriesHandler>;
  let mockSkipHandler: jest.Mocked<SkipRecurrenceOccurrenceHandler>;
  let mockEditSingleHandler: jest.Mocked<EditSingleOccurrenceHandler>;
  let mockEditFutureHandler: jest.Mocked<EditFutureOccurrencesHandler>;
  let mockCancelHandler: jest.Mocked<CancelRecurrenceSeriesHandler>;

  beforeEach(() => {
    mockCreateHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CreateRecurrenceSeriesHandler>;

    mockSkipHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<SkipRecurrenceOccurrenceHandler>;

    mockEditSingleHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<EditSingleOccurrenceHandler>;

    mockEditFutureHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<EditFutureOccurrencesHandler>;

    mockCancelHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CancelRecurrenceSeriesHandler>;

    controller = new RecurringAppointmentsController(
      mockCreateHandler,
      mockSkipHandler,
      mockEditSingleHandler,
      mockEditFutureHandler,
      mockCancelHandler,
    );
  });

  describe('createSeries endpoint (POST /api/v1/scheduling/recurring-appointments)', () => {
    it('executes create command and returns structured result', async () => {
      const mockResult: CreateRecurrenceSeriesResultDTO = {
        series: {
          id: 'series_ctrl_1',
          clientId: 'c1',
          therapistId: 't1',
          roomId: 'r1',
          serviceType: 'TREATMENT',
          pattern: {
            frequency: 'WEEKLY',
            startDate: '2026-09-01T09:00:00.000Z',
            localStartTime: { hour: 9, minute: 0 },
            durationMinutes: 60,
          },
          exceptions: [],
          status: 'ACTIVE',
          version: 1,
          createdAt: '2026-08-13T19:00:00.000Z',
          updatedAt: '2026-08-13T19:00:00.000Z',
        },
        initialGeneration: {
          seriesId: 'series_ctrl_1',
          requestedWindow: {
            start: '2026-09-01T00:00:00.000Z',
            end: '2026-11-01T00:00:00.000Z',
          },
          generatedCount: 4,
          skippedCount: 0,
          existingCount: 0,
          conflictCount: 0,
          isSeriesCompleted: false,
          generatedAppointments: [],
          conflictingOccurrences: [],
        },
      };

      mockCreateHandler.execute.mockResolvedValueOnce(ApplicationResult.ok(mockResult));

      const result = await controller.createSeries({
        clientId: 'c1',
        therapistId: 't1',
        roomId: 'r1',
        serviceType: 'TREATMENT',
        frequency: RecurrenceFrequency.WEEKLY,
        startDate: '2026-09-01T09:00:00.000Z',
        localStartTime: { hour: 9, minute: 0 },
        durationMinutes: 60,
      });

      expect(result.series.id).toBe('series_ctrl_1');
      expect(result.initialGeneration.generatedCount).toBe(4);
      expect(mockCreateHandler.execute).toHaveBeenCalledTimes(1);
    });

    it('throws BadRequestException when handler fails', async () => {
      mockCreateHandler.execute.mockResolvedValueOnce(
        ApplicationResult.fail('Invalid duration specified.'),
      );

      await expect(
        controller.createSeries({
          clientId: 'c1',
          therapistId: 't1',
          roomId: 'r1',
          serviceType: 'TREATMENT',
          frequency: RecurrenceFrequency.WEEKLY,
          startDate: '2026-09-01T09:00:00.000Z',
          localStartTime: { hour: 9, minute: 0 },
          durationMinutes: 60,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('skipOccurrence endpoint (POST /:seriesId/skip)', () => {
    it('executes skip command and returns confirmation', async () => {
      mockSkipHandler.execute.mockResolvedValueOnce(
        ApplicationResult.ok({
          seriesId: 'series_ctrl_1',
          occurrenceIndex: 2,
          date: '2026-09-15T09:00:00.000Z',
          isNewlySkipped: true,
          cancelledAppointmentId: 'appt_cancelled_1',
        }),
      );

      const result = await controller.skipOccurrence('series_ctrl_1', {
        occurrenceIndex: 2,
        reason: 'Client away',
      });

      expect(result.seriesId).toBe('series_ctrl_1');
      expect(result.occurrenceIndex).toBe(2);
    });

    it('throws NotFoundException when series is not found', async () => {
      mockSkipHandler.execute.mockResolvedValueOnce(
        ApplicationResult.fail('Recurrence series not found for ID: missing_id'),
      );

      await expect(controller.skipOccurrence('missing_id', { occurrenceIndex: 0 })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('editSingleOccurrence endpoint (PATCH /occurrences/:appointmentId)', () => {
    it('executes detach and edit command', async () => {
      const mockApptDto: AppointmentDTO = {
        id: 'appt_detached_1',
        clientId: 'c1',
        therapistId: 't1',
        roomId: 'r1',
        type: 'TREATMENT',
        status: 'SCHEDULED',
        startTime: '2026-09-15T14:00:00.000Z',
        endTime: '2026-09-15T15:30:00.000Z',
        durationMinutes: 90,
        notes: [],
        version: 2,
        createdAt: '2026-08-13T19:00:00.000Z',
        updatedAt: '2026-08-13T19:00:00.000Z',
        isDetachedFromSeries: true,
        seriesId: 'series_ctrl_1',
        occurrenceIndex: 2,
      };

      mockEditSingleHandler.execute.mockResolvedValueOnce(ApplicationResult.ok(mockApptDto));

      const result = await controller.editSingleOccurrence('appt_detached_1', {
        newDurationMinutes: 90,
      });

      expect(result.id).toBe('appt_detached_1');
      expect(result.isDetachedFromSeries).toBe(true);
    });
  });

  describe('editFutureOccurrences endpoint (POST /:seriesId/edit-future)', () => {
    it('executes cutoff-and-fork command', async () => {
      mockEditFutureHandler.execute.mockResolvedValueOnce(
        ApplicationResult.ok({
          oldSeriesId: 'series_s1',
          newSeriesId: 'series_s2',
          cutoffDate: '2026-10-01T00:00:00.000Z',
          cancelledAppointmentsCount: 3,
          newSeriesGeneratedCount: 5,
        }),
      );

      const result = await controller.editFutureOccurrences('series_s1', {
        cutoffDate: '2026-10-01T00:00:00.000Z',
        newFrequency: RecurrenceFrequency.BIWEEKLY,
      });

      expect(result).toBeDefined();
    });
  });

  describe('cancelSeries endpoint (POST /:seriesId/cancel)', () => {
    it('executes cancel command and returns summary', async () => {
      mockCancelHandler.execute.mockResolvedValueOnce(
        ApplicationResult.ok({
          seriesId: 'series_cancel_1',
          reason: 'Client relocated',
          cancelledAppointmentsCount: 4,
        }),
      );

      const result = await controller.cancelSeries('series_cancel_1', {
        reason: 'Client relocated',
      });

      expect(result.seriesId).toBe('series_cancel_1');
    });
  });
});
