import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { TreatmentSessionsController } from '../controllers/treatment-sessions.controller';
import {
  AssignTherapistToSessionHandler,
  UpdateSessionNotesHandler,
  CompleteTreatmentSessionHandler,
  GetClientTreatmentHistoryHandler,
  ApplicationResult,
  SessionStatus,
  TreatmentSessionDTO,
  PaginatedTreatmentHistoryDTO,
} from '@kinergy-platform/core';

describe('TreatmentSessionsController Unit Tests', () => {
  let controller: TreatmentSessionsController;
  let mockAssignTherapistHandler: jest.Mocked<AssignTherapistToSessionHandler>;
  let mockUpdateNotesHandler: jest.Mocked<UpdateSessionNotesHandler>;
  let mockCompleteSessionHandler: jest.Mocked<CompleteTreatmentSessionHandler>;
  let mockGetHistoryHandler: jest.Mocked<GetClientTreatmentHistoryHandler>;

  const mockSessionDTO: TreatmentSessionDTO = {
    id: 'sess_123',
    clientId: 'client_456',
    therapistId: 'therapist_789',
    appointmentId: 'appt_001',
    status: SessionStatus.SCHEDULED,
    notes: { rawText: 'Initial notes' },
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockPaginatedHistory: PaginatedTreatmentHistoryDTO = {
    items: [
      {
        sessionId: 'sess_123',
        clientId: 'client_456',
        appointmentId: 'appt_001',
        therapistId: 'therapist_789',
        status: SessionStatus.COMPLETED,
        notesSummary: 'Recovery observed',
        hasFullNotes: true,
        version: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    total: 1,
    page: 1,
    limit: 20,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  };

  beforeEach(() => {
    mockAssignTherapistHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<AssignTherapistToSessionHandler>;

    mockUpdateNotesHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<UpdateSessionNotesHandler>;

    mockCompleteSessionHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CompleteTreatmentSessionHandler>;

    mockGetHistoryHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetClientTreatmentHistoryHandler>;

    controller = new TreatmentSessionsController(
      mockAssignTherapistHandler,
      mockUpdateNotesHandler,
      mockCompleteSessionHandler,
      mockGetHistoryHandler,
    );
  });

  describe('assignTherapist endpoint (POST sessions/:id/assign-therapist)', () => {
    it('should successfully assign therapist and return DTO', async () => {
      mockAssignTherapistHandler.execute.mockResolvedValueOnce(
        ApplicationResult.ok(mockSessionDTO),
      );

      const result = await controller.assignTherapist('sess_123', {
        newTherapistId: 'therapist_new',
      });

      expect(result).toEqual(mockSessionDTO);
      expect(mockAssignTherapistHandler.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          input: { sessionId: 'sess_123', newTherapistId: 'therapist_new' },
        }),
      );
    });

    it('should throw BadRequestException if newTherapistId is missing', async () => {
      await expect(
        // @ts-expect-error - testing invalid transport payload
        controller.assignTherapist('sess_123', {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if session is not found', async () => {
      mockAssignTherapistHandler.execute.mockResolvedValueOnce(
        ApplicationResult.fail("TreatmentSession with ID 'sess_999' not found."),
      );

      await expect(
        controller.assignTherapist('sess_999', { newTherapistId: 'therapist_1' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw UnprocessableEntityException on domain lifecycle violation', async () => {
      mockAssignTherapistHandler.execute.mockResolvedValueOnce(
        ApplicationResult.fail(
          "Cannot reassign therapist for a session in 'COMPLETED' terminal status.",
        ),
      );

      await expect(
        controller.assignTherapist('sess_123', { newTherapistId: 'therapist_1' }),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('updateNotes endpoint (PUT sessions/:id/notes)', () => {
    it('should successfully update notes and return DTO', async () => {
      mockUpdateNotesHandler.execute.mockResolvedValueOnce(ApplicationResult.ok(mockSessionDTO));

      const result = await controller.updateNotes('sess_123', {
        subjective: 'Client feels better',
        plan: 'Follow up in 2 weeks',
      });

      expect(result).toEqual(mockSessionDTO);
      expect(mockUpdateNotesHandler.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            sessionId: 'sess_123',
            notes: { subjective: 'Client feels better', plan: 'Follow up in 2 weeks' },
          },
        }),
      );
    });

    it('should throw NotFoundException if session is not found', async () => {
      mockUpdateNotesHandler.execute.mockResolvedValueOnce(
        ApplicationResult.fail("TreatmentSession with ID 'sess_not_found' not found."),
      );

      await expect(controller.updateNotes('sess_not_found', { rawText: 'Notes' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw UnprocessableEntityException if domain notes validation fails', async () => {
      mockUpdateNotesHandler.execute.mockResolvedValueOnce(
        ApplicationResult.fail("Cannot update clinical notes for a session in 'COMPLETED' status."),
      );

      await expect(controller.updateNotes('sess_123', { rawText: 'Notes' })).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  describe('completeSession endpoint (POST sessions/:id/complete)', () => {
    it('should successfully complete session and return DTO', async () => {
      const completedDTO = { ...mockSessionDTO, status: SessionStatus.COMPLETED, version: 2 };
      mockCompleteSessionHandler.execute.mockResolvedValueOnce(ApplicationResult.ok(completedDTO));

      const result = await controller.completeSession('sess_123');

      expect(result).toEqual(completedDTO);
      expect(mockCompleteSessionHandler.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          input: { sessionId: 'sess_123' },
        }),
      );
    });

    it('should throw NotFoundException if session is not found', async () => {
      mockCompleteSessionHandler.execute.mockResolvedValueOnce(
        ApplicationResult.fail("TreatmentSession with ID 'sess_999' not found."),
      );

      await expect(controller.completeSession('sess_999')).rejects.toThrow(NotFoundException);
    });

    it('should throw UnprocessableEntityException on invalid lifecycle transition', async () => {
      mockCompleteSessionHandler.execute.mockResolvedValueOnce(
        ApplicationResult.fail("Session must be in 'IN_PROGRESS' status to be completed."),
      );

      await expect(controller.completeSession('sess_123')).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  describe('getTreatmentHistory endpoint (GET clients/:clientId/treatment-history)', () => {
    it('should successfully query history with filters and pagination', async () => {
      mockGetHistoryHandler.execute.mockResolvedValueOnce(
        ApplicationResult.ok(mockPaginatedHistory),
      );

      const result = await controller.getTreatmentHistory('client_456', {
        page: 1,
        limit: 10,
        status: SessionStatus.COMPLETED,
        therapistId: 'therapist_789',
        dateFrom: '2026-08-01T00:00:00.000Z',
        dateTo: '2026-08-17T23:59:59.999Z',
      });

      expect(result).toEqual(mockPaginatedHistory);
      expect(mockGetHistoryHandler.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            clientId: 'client_456',
            page: 1,
            limit: 10,
            status: SessionStatus.COMPLETED,
            therapistId: 'therapist_789',
          }),
        }),
      );
    });

    it('should throw BadRequestException if clientId is empty', async () => {
      await expect(controller.getTreatmentHistory('   ', {})).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if dateFrom format is invalid', async () => {
      await expect(
        controller.getTreatmentHistory('client_456', { dateFrom: 'invalid-date' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if dateTo format is invalid', async () => {
      await expect(
        controller.getTreatmentHistory('client_456', { dateTo: 'invalid-date' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if status parameter is not a valid SessionStatus enum', async () => {
      await expect(
        controller.getTreatmentHistory('client_456', { status: 'INVALID_STATUS' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if query handler fails', async () => {
      mockGetHistoryHandler.execute.mockResolvedValueOnce(
        ApplicationResult.fail('dateFrom cannot be greater than dateTo.'),
      );

      await expect(
        controller.getTreatmentHistory('client_456', {
          dateFrom: '2026-08-20T00:00:00.000Z',
          dateTo: '2026-08-10T00:00:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
