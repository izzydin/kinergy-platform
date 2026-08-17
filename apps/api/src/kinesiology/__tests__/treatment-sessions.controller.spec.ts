import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { TreatmentSessionsController } from '../controllers/treatment-sessions.controller';
import {
  CreateTreatmentSessionFromAppointmentHandler,
  GetTreatmentSessionByIdHandler,
  StartTreatmentSessionHandler,
  AssignTherapistToSessionHandler,
  UpdateSessionNotesHandler,
  CompleteTreatmentSessionHandler,
  CancelTreatmentSessionHandler,
  GetClientTreatmentHistoryHandler,
  ApplicationResult,
  SessionStatus,
  TreatmentSessionDTO,
  PaginatedTreatmentHistoryDTO,
} from '@kinergy-platform/core';

describe('TreatmentSessionsController Unit Tests', () => {
  let controller: TreatmentSessionsController;
  let mockCreateSessionHandler: jest.Mocked<CreateTreatmentSessionFromAppointmentHandler>;
  let mockGetSessionByIdHandler: jest.Mocked<GetTreatmentSessionByIdHandler>;
  let mockStartSessionHandler: jest.Mocked<StartTreatmentSessionHandler>;
  let mockAssignTherapistHandler: jest.Mocked<AssignTherapistToSessionHandler>;
  let mockUpdateNotesHandler: jest.Mocked<UpdateSessionNotesHandler>;
  let mockCompleteSessionHandler: jest.Mocked<CompleteTreatmentSessionHandler>;
  let mockCancelSessionHandler: jest.Mocked<CancelTreatmentSessionHandler>;
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
    mockCreateSessionHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CreateTreatmentSessionFromAppointmentHandler>;

    mockGetSessionByIdHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetTreatmentSessionByIdHandler>;

    mockStartSessionHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<StartTreatmentSessionHandler>;

    mockAssignTherapistHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<AssignTherapistToSessionHandler>;

    mockUpdateNotesHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<UpdateSessionNotesHandler>;

    mockCompleteSessionHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CompleteTreatmentSessionHandler>;

    mockCancelSessionHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CancelTreatmentSessionHandler>;

    mockGetHistoryHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetClientTreatmentHistoryHandler>;

    controller = new TreatmentSessionsController(
      mockCreateSessionHandler,
      mockGetSessionByIdHandler,
      mockStartSessionHandler,
      mockAssignTherapistHandler,
      mockUpdateNotesHandler,
      mockCompleteSessionHandler,
      mockCancelSessionHandler,
      mockGetHistoryHandler,
    );
  });

  describe('createSession endpoint (POST sessions)', () => {
    it('should successfully create session from appointment and return DTO', async () => {
      mockCreateSessionHandler.execute.mockResolvedValueOnce(ApplicationResult.ok(mockSessionDTO));

      const result = await controller.createSession({
        appointmentId: 'appt_001',
      });

      expect(result).toEqual(mockSessionDTO);
      expect(mockCreateSessionHandler.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({ appointmentId: 'appt_001' }),
        }),
      );
    });

    it('should throw BadRequestException if appointmentId is missing', async () => {
      await expect(controller.createSession({ appointmentId: '   ' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw ConflictException if session already exists for appointment', async () => {
      mockCreateSessionHandler.execute.mockResolvedValueOnce(
        ApplicationResult.fail("A TreatmentSession already exists for appointment 'appt_001'."),
      );

      await expect(controller.createSession({ appointmentId: 'appt_001' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw NotFoundException if appointment is not found', async () => {
      mockCreateSessionHandler.execute.mockResolvedValueOnce(
        ApplicationResult.fail("Appointment with ID 'appt_999' was not found."),
      );

      await expect(controller.createSession({ appointmentId: 'appt_999' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getSessionById endpoint (GET sessions/:id)', () => {
    it('should successfully return session DTO', async () => {
      mockGetSessionByIdHandler.execute.mockResolvedValueOnce(ApplicationResult.ok(mockSessionDTO));

      const result = await controller.getSessionById('sess_123');

      expect(result).toEqual(mockSessionDTO);
    });

    it('should throw NotFoundException if session is not found', async () => {
      mockGetSessionByIdHandler.execute.mockResolvedValueOnce(
        ApplicationResult.fail("TreatmentSession with ID 'sess_999' not found."),
      );

      await expect(controller.getSessionById('sess_999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('startSession endpoint (POST sessions/:id/start)', () => {
    it('should successfully start session and return DTO', async () => {
      const inProgressDTO = { ...mockSessionDTO, status: SessionStatus.IN_PROGRESS, version: 2 };
      mockStartSessionHandler.execute.mockResolvedValueOnce(ApplicationResult.ok(inProgressDTO));

      const result = await controller.startSession('sess_123');

      expect(result).toEqual(inProgressDTO);
    });

    it('should throw UnprocessableEntityException if session is in invalid state', async () => {
      mockStartSessionHandler.execute.mockResolvedValueOnce(
        ApplicationResult.fail("Session must be in 'SCHEDULED' status to be started."),
      );

      await expect(controller.startSession('sess_123')).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  describe('assignTherapist endpoint (POST sessions/:id/assign-therapist & PATCH therapist)', () => {
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
      await expect(controller.assignTherapist('sess_123', { newTherapistId: '' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if session is not found', async () => {
      mockAssignTherapistHandler.execute.mockResolvedValueOnce(
        ApplicationResult.fail("TreatmentSession with ID 'sess_999' not found."),
      );

      await expect(
        controller.assignTherapist('sess_999', { newTherapistId: 'therapist_new' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateNotes endpoint (PUT sessions/:id/notes & PATCH notes)', () => {
    it('should successfully update notes and return DTO', async () => {
      mockUpdateNotesHandler.execute.mockResolvedValueOnce(ApplicationResult.ok(mockSessionDTO));

      const result = await controller.updateNotes('sess_123', {
        subjective: 'Patient feels better',
        plan: 'Continue therapy',
      });

      expect(result).toEqual(mockSessionDTO);
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

  describe('cancelSession endpoint (POST sessions/:id/cancel)', () => {
    it('should successfully cancel session and return DTO', async () => {
      const cancelledDTO = { ...mockSessionDTO, status: SessionStatus.CANCELLED, version: 2 };
      mockCancelSessionHandler.execute.mockResolvedValueOnce(ApplicationResult.ok(cancelledDTO));

      const result = await controller.cancelSession('sess_123', {
        reason: 'Patient unwell',
      });

      expect(result).toEqual(cancelledDTO);
    });

    it('should throw BadRequestException if reason is empty', async () => {
      await expect(controller.cancelSession('sess_123', { reason: '   ' })).rejects.toThrow(
        BadRequestException,
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
        limit: 20,
        status: SessionStatus.COMPLETED,
      });

      expect(result).toEqual(mockPaginatedHistory);
    });

    it('should throw BadRequestException if clientId is empty', async () => {
      await expect(controller.getTreatmentHistory('   ', {})).rejects.toThrow(BadRequestException);
    });
  });
});
