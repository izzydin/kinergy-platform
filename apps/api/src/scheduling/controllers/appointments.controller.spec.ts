import { AppointmentsController } from './appointments.controller';
import {
  ApplicationResult,
  AppointmentDTO,
  CreateAppointmentHandler,
  RescheduleAppointmentHandler,
  CancelAppointmentHandler,
  ConfirmAppointmentHandler,
  CheckInAppointmentHandler,
  CompleteAppointmentHandler,
  MarkNoShowHandler,
  AddAppointmentNoteHandler,
  GetAppointmentByIdHandler,
  FindAppointmentsByRangeHandler,
  GetDailyAgendaHandler,
  GetWeeklyAgendaHandler,
  ConflictDetectionService,
  SlotFinderEngine,
} from '@kinergy-platform/core';
import { PrismaAppointmentRepository } from '@kinergy-platform/core/server';
import { PrismaService } from '../../platform/persistence/prisma/prisma.service';

describe('AppointmentsController — Client Name Enrichment & Privacy', () => {
  let controller: AppointmentsController;
  let mockPrisma: { client: { findMany: jest.Mock } };
  let mockFindAppointmentsByRangeHandler: { execute: jest.Mock };
  let mockGetAppointmentByIdHandler: { execute: jest.Mock };
  let mockGetDailyAgendaHandler: { execute: jest.Mock };
  let mockGetWeeklyAgendaHandler: { execute: jest.Mock };

  const sampleAppointmentDTO: AppointmentDTO = {
    id: 'appt_101',
    status: 'SCHEDULED',
    type: 'ASSESSMENT',
    clientId: 'cli-seed-carlos-03',
    therapistId: 'therapist_sarah',
    roomId: 'room_1',
    startTime: '2026-10-24T14:00:00.000Z',
    endTime: '2026-10-24T15:00:00.000Z',
    durationMinutes: 60,
    version: 1,
    createdAt: '2026-10-20T10:00:00.000Z',
    updatedAt: '2026-10-20T10:00:00.000Z',
    notes: [
      {
        id: 'note_1',
        authorId: 'therapist_sarah',
        noteText: 'Lower back stiffness',
        createdAt: '2026-10-20T10:00:00.000Z',
      },
    ],
  };

  beforeEach(() => {
    mockPrisma = {
      client: {
        findMany: jest.fn(),
      },
    };

    mockFindAppointmentsByRangeHandler = {
      execute: jest.fn().mockResolvedValue(ApplicationResult.ok([sampleAppointmentDTO])),
    };

    mockGetAppointmentByIdHandler = {
      execute: jest.fn().mockResolvedValue(ApplicationResult.ok(sampleAppointmentDTO)),
    };

    mockGetDailyAgendaHandler = {
      execute: jest.fn().mockResolvedValue(
        ApplicationResult.ok({
          date: '2026-10-24',
          totalAppointments: 1,
          summaryByStatus: { SCHEDULED: 1 },
          slots: [
            {
              id: 'slot-1',
              startTime: '2026-10-24T14:00:00.000Z',
              endTime: '2026-10-24T15:00:00.000Z',
              status: 'SCHEDULED',
              clientId: 'cli-seed-carlos-03',
            },
          ],
          appointmentsByTherapist: {},
          appointmentsByRoom: {},
        }),
      ),
    };

    mockGetWeeklyAgendaHandler = {
      execute: jest.fn(),
    };

    controller = new AppointmentsController(
      {} as unknown as CreateAppointmentHandler,
      {} as unknown as RescheduleAppointmentHandler,
      {} as unknown as CancelAppointmentHandler,
      {} as unknown as ConfirmAppointmentHandler,
      {} as unknown as CheckInAppointmentHandler,
      {} as unknown as CompleteAppointmentHandler,
      {} as unknown as MarkNoShowHandler,
      {} as unknown as AddAppointmentNoteHandler,
      mockGetAppointmentByIdHandler as unknown as GetAppointmentByIdHandler,
      mockFindAppointmentsByRangeHandler as unknown as FindAppointmentsByRangeHandler,
      mockGetDailyAgendaHandler as unknown as GetDailyAgendaHandler,
      mockGetWeeklyAgendaHandler as unknown as GetWeeklyAgendaHandler,
      {} as unknown as ConflictDetectionService,
      {} as unknown as SlotFinderEngine,
      {} as unknown as PrismaAppointmentRepository,
      undefined, // clock
      mockPrisma as unknown as PrismaService,
    );
  });

  it('enriches listed appointments with batched client summary and full name', async () => {
    mockPrisma.client.findMany.mockResolvedValueOnce([
      {
        id: 'cli-seed-carlos-03',
        firstName: '  Carlos ',
        lastName: ' Rivera  ',
      },
    ]);

    const result = await controller.listAppointments(
      '2026-10-24T00:00:00.000Z',
      '2026-10-24T23:59:59.999Z',
    );

    expect(result).toHaveLength(1);
    const appt = result[0]!;
    expect(appt.clientName).toBe('Carlos Rivera');
    expect(appt.client).toEqual({
      id: 'cli-seed-carlos-03',
      firstName: 'Carlos',
      lastName: 'Rivera',
      fullName: 'Carlos Rivera',
    });
    // Check batched findMany was called with single in-query
    expect(mockPrisma.client.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['cli-seed-carlos-03'] } },
      select: { id: true, firstName: true, lastName: true },
    });
    // Check note enrichment
    expect((appt.notes?.[0] as unknown as { content?: string })?.content).toBe(
      'Lower back stiffness',
    );
  });

  it('enriches getAppointment by ID with client summary and full name', async () => {
    mockPrisma.client.findMany.mockResolvedValueOnce([
      {
        id: 'cli-seed-carlos-03',
        firstName: 'Carlos',
        lastName: 'Rivera',
      },
    ]);

    const appt = await controller.getAppointment('appt_101');
    expect(appt.clientName).toBe('Carlos Rivera');
    expect(appt.client?.fullName).toBe('Carlos Rivera');
  });

  it('falls back to "Client information unavailable" when client is not found in database', async () => {
    mockPrisma.client.findMany.mockResolvedValueOnce([]);

    const result = await controller.listAppointments(
      '2026-10-24T00:00:00.000Z',
      '2026-10-24T23:59:59.999Z',
    );

    expect(result[0]!.clientName).toBe('Client information unavailable');
    expect(result[0]!.client?.fullName).toBe('Client information unavailable');
  });

  it('handles clients with only first name or only last name without extra whitespace', async () => {
    mockPrisma.client.findMany.mockResolvedValueOnce([
      {
        id: 'cli-seed-carlos-03',
        firstName: 'Carlos',
        lastName: null,
      },
    ]);

    const result = await controller.listAppointments(
      '2026-10-24T00:00:00.000Z',
      '2026-10-24T23:59:59.999Z',
    );

    expect(result[0]!.clientName).toBe('Carlos');
    expect(result[0]!.client?.fullName).toBe('Carlos');
  });

  it('enforces data minimization and privacy (no email, phone, or medical history attached)', async () => {
    mockPrisma.client.findMany.mockResolvedValueOnce([
      {
        id: 'cli-seed-carlos-03',
        firstName: 'Carlos',
        lastName: 'Rivera',
      },
    ]);

    const result = await controller.listAppointments(
      '2026-10-24T00:00:00.000Z',
      '2026-10-24T23:59:59.999Z',
    );

    const clientObj = result[0]!.client as unknown as Record<string, unknown>;
    expect(clientObj['email']).toBeUndefined();
    expect(clientObj['phone']).toBeUndefined();
    expect(clientObj['medicalHistory']).toBeUndefined();
    expect(clientObj['insurance']).toBeUndefined();
  });

  it('enriches daily calendar agenda slots with client names', async () => {
    mockPrisma.client.findMany.mockResolvedValueOnce([
      {
        id: 'cli-seed-carlos-03',
        firstName: 'Carlos',
        lastName: 'Rivera',
      },
    ]);

    const agenda = (await controller.getCalendarAgenda('day', '2026-10-24')) as {
      slots: { clientName?: string }[];
    };
    expect(agenda.slots[0]?.clientName).toBe('Carlos Rivera');
  });
});
