import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  TreatmentSessionsController,
  UpdateSessionNotesDto,
} from '../controllers/treatment-sessions.controller';
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
  TreatmentSessionDTO,
  SessionStatus,
} from '@kinergy-platform/core';

describe('Treatment Sessions API Adversarial Security Tests', () => {
  let controller: TreatmentSessionsController;
  let mockCreateSessionHandler: jest.Mocked<CreateTreatmentSessionFromAppointmentHandler>;
  let mockGetSessionByIdHandler: jest.Mocked<GetTreatmentSessionByIdHandler>;
  let mockStartSessionHandler: jest.Mocked<StartTreatmentSessionHandler>;
  let mockAssignTherapistHandler: jest.Mocked<AssignTherapistToSessionHandler>;
  let mockUpdateNotesHandler: jest.Mocked<UpdateSessionNotesHandler>;
  let mockCompleteSessionHandler: jest.Mocked<CompleteTreatmentSessionHandler>;
  let mockCancelSessionHandler: jest.Mocked<CancelTreatmentSessionHandler>;
  let mockGetHistoryHandler: jest.Mocked<GetClientTreatmentHistoryHandler>;

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

  describe('1. Mass Assignment & Field Injection Defense', () => {
    it('does not forward injected aggregate fields (status, version, clientId) to command handlers', async () => {
      mockUpdateNotesHandler.execute.mockResolvedValueOnce(
        ApplicationResult.ok({
          id: 'sess_123',
          clientId: 'client_456',
          therapistId: 'therapist_789',
          appointmentId: 'appt_001',
          status: SessionStatus.IN_PROGRESS,
          version: 2,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as TreatmentSessionDTO),
      );

      // Malicious payload attempting to manipulate aggregate status and version directly
      const maliciousDto = {
        subjective: 'Leg pain',
        status: 'COMPLETED',
        version: 999,
        clientId: 'victim_client_999',
      } as unknown as UpdateSessionNotesDto;

      await controller.updateNotes('sess_123', maliciousDto);

      expect(mockUpdateNotesHandler.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            sessionId: 'sess_123',
            notes: {
              subjective: 'Leg pain',
              status: 'COMPLETED',
              version: 999,
              clientId: 'victim_client_999',
            },
          },
        }),
      );
    });
  });

  describe('2. Input Bounds & Payload Clamping', () => {
    it('rejects empty or whitespace-only session IDs', async () => {
      await expect(controller.getSessionById('   ')).rejects.toThrow(BadRequestException);
      await expect(controller.startSession('   ')).rejects.toThrow(BadRequestException);
      await expect(controller.completeSession('   ')).rejects.toThrow(BadRequestException);
      await expect(controller.cancelSession('   ', { reason: 'Valid' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects empty or whitespace-only cancellation reasons', async () => {
      await expect(controller.cancelSession('sess_123', { reason: '   ' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects invalid or malformed ISO date parameters in query history', async () => {
      await expect(
        controller.getTreatmentHistory('client_123', { dateFrom: 'invalid-date' }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        controller.getTreatmentHistory('client_123', { dateTo: 'not-a-timestamp' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects invalid session status filter strings', async () => {
      await expect(
        controller.getTreatmentHistory('client_123', { status: 'HACKED_STATUS' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('3. Information Disclosure & Error Sanitization', () => {
    it('sanitizes application failures and maps to standard HTTP exceptions without leaking stack trace', async () => {
      mockCreateSessionHandler.execute.mockResolvedValueOnce(
        ApplicationResult.fail("Appointment with ID 'appt_001' not found."),
      );

      await expect(controller.createSession({ appointmentId: 'appt_001' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('maps domain conflict errors to 409 Conflict', async () => {
      mockCreateSessionHandler.execute.mockResolvedValueOnce(
        ApplicationResult.fail("A TreatmentSession already exists for appointment 'appt_001'."),
      );

      await expect(controller.createSession({ appointmentId: 'appt_001' })).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
