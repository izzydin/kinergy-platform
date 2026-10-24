import { schedulingApi } from '../scheduling-api';
import { httpClient } from '../../../../shared/api/http-client';

jest.mock('../../../../shared/api/http-client', () => ({
  httpClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

describe('schedulingApi Transport Layer & Contract Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Appointments Operations', () => {
    it('listAppointments serializes parameters and query string correctly', async () => {
      (httpClient.get as jest.Mock).mockResolvedValueOnce([]);

      const params = {
        startDate: '2026-10-24T00:00:00.000Z',
        endDate: '2026-10-31T23:59:59.999Z',
        therapistId: 'therapist-1',
        roomId: 'room-1',
        clientId: 'client-1',
        status: 'CONFIRMED',
      };

      await schedulingApi.listAppointments(params);

      expect(httpClient.get).toHaveBeenCalledWith('/api/v1/scheduling/appointments', {
        params: {
          startDate: '2026-10-24T00:00:00.000Z',
          endDate: '2026-10-31T23:59:59.999Z',
          therapistId: 'therapist-1',
          roomId: 'room-1',
          clientId: 'client-1',
          status: 'CONFIRMED',
        },
      });
    });

    it('listAppointments handles boundary timestamps crossing midnight', async () => {
      (httpClient.get as jest.Mock).mockResolvedValueOnce([]);

      await schedulingApi.listAppointments({
        startDate: '2026-10-24T23:59:59.999Z',
        endDate: '2026-10-25T00:00:00.000Z',
      });

      expect(httpClient.get).toHaveBeenCalledWith('/api/v1/scheduling/appointments', {
        params: {
          startDate: '2026-10-24T23:59:59.999Z',
          endDate: '2026-10-25T00:00:00.000Z',
          therapistId: undefined,
          roomId: undefined,
          clientId: undefined,
          status: undefined,
        },
      });
    });

    it('getAppointment invokes GET with URI encoded identifier', async () => {
      (httpClient.get as jest.Mock).mockResolvedValueOnce({ id: 'appt-123' });

      const result = await schedulingApi.getAppointment('appt-123');

      expect(httpClient.get).toHaveBeenCalledWith('/api/v1/scheduling/appointments/appt-123');
      expect(result).toEqual({ id: 'appt-123' });
    });

    it('createAppointment trims string fields and posts payload', async () => {
      (httpClient.post as jest.Mock).mockResolvedValueOnce({ id: 'appt-new' });

      await schedulingApi.createAppointment({
        clientId: '  client-1  ',
        therapistId: '  therapist-1  ',
        roomId: '  room-1  ',
        type: '  TREATMENT  ',
        startTime: '2026-10-24T14:00:00.000Z',
        endTime: '2026-10-24T15:00:00.000Z',
        notes: ' Initial session ',
      });

      expect(httpClient.post).toHaveBeenCalledWith('/api/v1/scheduling/appointments', {
        clientId: 'client-1',
        therapistId: 'therapist-1',
        roomId: 'room-1',
        type: 'TREATMENT',
        startTime: '2026-10-24T14:00:00.000Z',
        endTime: '2026-10-24T15:00:00.000Z',
        notes: 'Initial session',
      });
    });

    it('rescheduleAppointment patches new time interval', async () => {
      (httpClient.patch as jest.Mock).mockResolvedValueOnce({
        id: 'appt-1',
        status: 'RESCHEDULED',
      });

      await schedulingApi.rescheduleAppointment('appt-1', {
        newStartTime: '2026-10-25T14:00:00.000Z',
        newEndTime: '2026-10-25T15:00:00.000Z',
        reason: 'Client requested reschedule',
      });

      expect(httpClient.patch).toHaveBeenCalledWith(
        '/api/v1/scheduling/appointments/appt-1/reschedule',
        {
          newStartTime: '2026-10-25T14:00:00.000Z',
          newEndTime: '2026-10-25T15:00:00.000Z',
          reason: 'Client requested reschedule',
        },
      );
    });

    it('cancelAppointment posts mandatory cancellation reason', async () => {
      (httpClient.post as jest.Mock).mockResolvedValueOnce({ id: 'appt-1', status: 'CANCELLED' });

      await schedulingApi.cancelAppointment('appt-1', {
        reason: 'Client illness',
      });

      expect(httpClient.post).toHaveBeenCalledWith(
        '/api/v1/scheduling/appointments/appt-1/cancel',
        {
          reason: 'Client illness',
        },
      );
    });

    it('supports all lifecycle transitions (confirm, check-in, start, complete, no-show)', async () => {
      (httpClient.post as jest.Mock).mockResolvedValue({ id: 'appt-1' });

      await schedulingApi.confirmAppointment('appt-1');
      expect(httpClient.post).toHaveBeenCalledWith(
        '/api/v1/scheduling/appointments/appt-1/confirm',
        {},
      );

      await schedulingApi.checkInAppointment('appt-1');
      expect(httpClient.post).toHaveBeenCalledWith(
        '/api/v1/scheduling/appointments/appt-1/check-in',
        {},
      );

      await schedulingApi.startAppointment('appt-1');
      expect(httpClient.post).toHaveBeenCalledWith(
        '/api/v1/scheduling/appointments/appt-1/start',
        {},
      );

      await schedulingApi.completeAppointment('appt-1');
      expect(httpClient.post).toHaveBeenCalledWith(
        '/api/v1/scheduling/appointments/appt-1/complete',
        {},
      );

      await schedulingApi.markNoShow('appt-1', { reason: 'No notice given' });
      expect(httpClient.post).toHaveBeenCalledWith(
        '/api/v1/scheduling/appointments/appt-1/no-show',
        {
          reason: 'No notice given',
        },
      );
    });

    it('addAppointmentNote trims note content and posts to notes subresource', async () => {
      (httpClient.post as jest.Mock).mockResolvedValueOnce({ id: 'appt-1' });

      await schedulingApi.addAppointmentNote('appt-1', {
        content: '  Patient reported knee pain improved.  ',
      });

      expect(httpClient.post).toHaveBeenCalledWith('/api/v1/scheduling/appointments/appt-1/notes', {
        content: 'Patient reported knee pain improved.',
      });
    });
  });

  describe('2. Availability & Calendar Projections', () => {
    it('checkConflict sends 4D vector evaluation parameters', async () => {
      (httpClient.post as jest.Mock).mockResolvedValueOnce({ hasConflict: false, conflicts: [] });

      await schedulingApi.checkConflict({
        therapistId: 'therapist-1',
        roomId: 'room-1',
        clientId: 'client-1',
        startTime: '2026-10-24T14:00:00.000Z',
        endTime: '2026-10-24T15:00:00.000Z',
        appointmentType: 'TREATMENT',
        excludeAppointmentId: 'appt-current',
      });

      expect(httpClient.post).toHaveBeenCalledWith(
        '/api/v1/scheduling/availability/check-conflict',
        {
          therapistId: 'therapist-1',
          roomId: 'room-1',
          clientId: 'client-1',
          startTime: '2026-10-24T14:00:00.000Z',
          endTime: '2026-10-24T15:00:00.000Z',
          appointmentType: 'TREATMENT',
          excludeAppointmentId: 'appt-current',
        },
      );
    });

    it('findAvailableSlots serializes query parameters', async () => {
      (httpClient.get as jest.Mock).mockResolvedValueOnce([]);

      await schedulingApi.findAvailableSlots({
        date: '2026-10-24',
        serviceType: 'ASSESSMENT',
        therapistId: 'therapist-1',
        roomId: 'room-1',
      });

      expect(httpClient.get).toHaveBeenCalledWith('/api/v1/scheduling/availability/slots', {
        params: {
          date: '2026-10-24',
          serviceType: 'ASSESSMENT',
          therapistId: 'therapist-1',
          roomId: 'room-1',
        },
      });
    });

    it('getCalendarAgenda requests daily agenda projection', async () => {
      (httpClient.get as jest.Mock).mockResolvedValueOnce({
        date: '2026-10-24',
        totalAppointments: 3,
      });

      await schedulingApi.getCalendarAgenda({
        view: 'day',
        date: '2026-10-24',
        therapistId: 'therapist-1',
      });

      expect(httpClient.get).toHaveBeenCalledWith('/api/v1/scheduling/calendar/agenda', {
        params: {
          view: 'day',
          date: '2026-10-24',
          therapistId: 'therapist-1',
          roomId: undefined,
        },
      });
    });

    it('getServiceTypes retrieves bookable service catalog', async () => {
      (httpClient.get as jest.Mock).mockResolvedValueOnce([
        { type: 'ASSESSMENT', standardDurationMinutes: 60 },
      ]);

      const result = await schedulingApi.getServiceTypes();

      expect(httpClient.get).toHaveBeenCalledWith('/api/v1/scheduling/service-types');
      expect(result).toHaveLength(1);
    });
  });

  describe('3. Rooms & Schedulable Resources Operations', () => {
    it('listRooms converts features array into comma-separated query string', async () => {
      (httpClient.get as jest.Mock).mockResolvedValueOnce([]);

      await schedulingApi.listRooms({
        status: 'AVAILABLE',
        minCapacity: 2,
        features: ['PILATES_REFORMER', 'MIRRORS'],
      });

      expect(httpClient.get).toHaveBeenCalledWith('/api/v1/scheduling/rooms', {
        params: {
          status: 'AVAILABLE',
          minCapacity: 2,
          features: 'PILATES_REFORMER,MIRRORS',
        },
      });
    });

    it('getRoom retrieves details by ID', async () => {
      (httpClient.get as jest.Mock).mockResolvedValueOnce({ id: 'room-1', name: 'Studio A' });

      await schedulingApi.getRoom('room-1');

      expect(httpClient.get).toHaveBeenCalledWith('/api/v1/scheduling/rooms/room-1');
    });

    it('createRoom posts name, capacity, and features', async () => {
      (httpClient.post as jest.Mock).mockResolvedValueOnce({ id: 'room-new' });

      await schedulingApi.createRoom({
        name: ' Studio B ',
        capacity: 4,
        features: ['PILATES_REFORMER'],
      });

      expect(httpClient.post).toHaveBeenCalledWith('/api/v1/scheduling/rooms', {
        name: 'Studio B',
        capacity: 4,
        features: ['PILATES_REFORMER'],
      });
    });

    it('editRoom includes expectedVersion for optimistic concurrency control', async () => {
      (httpClient.patch as jest.Mock).mockResolvedValueOnce({ id: 'room-1', version: 2 });

      await schedulingApi.editRoom('room-1', {
        name: 'Studio B Expanded',
        capacity: 6,
        expectedVersion: 1,
      });

      expect(httpClient.patch).toHaveBeenCalledWith('/api/v1/scheduling/rooms/room-1', {
        name: 'Studio B Expanded',
        capacity: 6,
        features: undefined,
        expectedVersion: 1,
      });
    });

    it('activateRoom and deactivateRoom post correct state machine transitions', async () => {
      (httpClient.post as jest.Mock).mockResolvedValue({ id: 'room-1' });

      await schedulingApi.activateRoom('room-1', { expectedVersion: 2 });
      expect(httpClient.post).toHaveBeenCalledWith('/api/v1/scheduling/rooms/room-1/activate', {
        expectedVersion: 2,
      });

      await schedulingApi.deactivateRoom('room-1', {
        reason: 'HVAC repair',
        expectedVersion: 3,
      });
      expect(httpClient.post).toHaveBeenCalledWith('/api/v1/scheduling/rooms/room-1/deactivate', {
        reason: 'HVAC repair',
        expectedVersion: 3,
      });
    });

    it('scheduleMaintenance and cancelMaintenance manage room blocks', async () => {
      (httpClient.post as jest.Mock).mockResolvedValueOnce({ id: 'room-1' });
      (httpClient.delete as jest.Mock).mockResolvedValueOnce({ id: 'room-1' });

      await schedulingApi.scheduleMaintenance('room-1', {
        startTime: '2026-10-26T08:00:00.000Z',
        endTime: '2026-10-26T12:00:00.000Z',
        reason: 'Floor refinishing',
        expectedVersion: 4,
      });
      expect(httpClient.post).toHaveBeenCalledWith('/api/v1/scheduling/rooms/room-1/maintenance', {
        startTime: '2026-10-26T08:00:00.000Z',
        endTime: '2026-10-26T12:00:00.000Z',
        reason: 'Floor refinishing',
        expectedVersion: 4,
      });

      await schedulingApi.cancelMaintenance('room-1', 'maint-101');
      expect(httpClient.delete).toHaveBeenCalledWith(
        '/api/v1/scheduling/rooms/room-1/maintenance/maint-101',
      );
    });

    it('checkRoomAvailability evaluates capacity and feature requirements', async () => {
      (httpClient.get as jest.Mock).mockResolvedValueOnce({ isAvailable: true });

      await schedulingApi.checkRoomAvailability({
        startTime: '2026-10-24T14:00:00.000Z',
        endTime: '2026-10-24T15:00:00.000Z',
        roomId: 'room-1',
        requiredCapacity: 2,
        requiredFeatures: ['PILATES_REFORMER'],
      });

      expect(httpClient.get).toHaveBeenCalledWith('/api/v1/scheduling/rooms/availability', {
        params: {
          startTime: '2026-10-24T14:00:00.000Z',
          endTime: '2026-10-24T15:00:00.000Z',
          roomId: 'room-1',
          requiredCapacity: 2,
          features: 'PILATES_REFORMER',
        },
      });
    });
  });

  describe('4. Recurring Appointments Operations', () => {
    it('createRecurrenceSeries posts full series specification', async () => {
      (httpClient.post as jest.Mock).mockResolvedValueOnce({ series: { id: 'series-1' } });

      await schedulingApi.createRecurrenceSeries({
        clientId: 'client-1',
        therapistId: 'therapist-1',
        roomId: 'room-1',
        serviceType: 'TREATMENT',
        frequency: 'WEEKLY',
        startDate: '2026-10-24T00:00:00.000Z',
        localStartTime: '10:00',
        durationMinutes: 60,
        maxOccurrences: 10,
        timezone: 'America/New_York',
      });

      expect(httpClient.post).toHaveBeenCalledWith('/api/v1/scheduling/recurring-appointments', {
        clientId: 'client-1',
        therapistId: 'therapist-1',
        roomId: 'room-1',
        serviceType: 'TREATMENT',
        frequency: 'WEEKLY',
        startDate: '2026-10-24T00:00:00.000Z',
        endDate: undefined,
        maxOccurrences: 10,
        localStartTime: '10:00',
        durationMinutes: 60,
        timezone: 'America/New_York',
        horizonDays: undefined,
      });
    });

    it('skipOccurrence posts seriesId and occurrenceIndex', async () => {
      (httpClient.post as jest.Mock).mockResolvedValueOnce({ status: 'SKIPPED' });

      await schedulingApi.skipOccurrence('series-1', {
        occurrenceIndex: 3,
        reason: 'Client vacation',
      });

      expect(httpClient.post).toHaveBeenCalledWith(
        '/api/v1/scheduling/recurring-appointments/series-1/skip',
        {
          occurrenceIndex: 3,
          reason: 'Client vacation',
        },
      );
    });

    it('editSingleOccurrence detaches and reschedules single slot', async () => {
      (httpClient.patch as jest.Mock).mockResolvedValueOnce({
        id: 'appt-1',
        isDetachedFromSeries: true,
      });

      await schedulingApi.editSingleOccurrence('appt-1', {
        newStartTime: '2026-10-26T15:00:00.000Z',
        newRoomId: 'room-2',
        rescheduleReason: 'Room conflict resolved',
      });

      expect(httpClient.patch).toHaveBeenCalledWith(
        '/api/v1/scheduling/recurring-appointments/occurrences/appt-1',
        {
          newStartTime: '2026-10-26T15:00:00.000Z',
          newTherapistId: undefined,
          newRoomId: 'room-2',
          rescheduleReason: 'Room conflict resolved',
        },
      );
    });

    it('editFutureOccurrences posts cutoff date for cutoff-and-fork', async () => {
      (httpClient.post as jest.Mock).mockResolvedValueOnce({ oldSeriesId: 'series-1' });

      await schedulingApi.editFutureOccurrences('series-1', {
        cutoffDate: '2026-11-01T00:00:00.000Z',
        fromOccurrenceIndex: 4,
        newLocalStartTime: '11:00',
      });

      expect(httpClient.post).toHaveBeenCalledWith(
        '/api/v1/scheduling/recurring-appointments/series-1/edit-future',
        {
          cutoffDate: '2026-11-01T00:00:00.000Z',
          fromOccurrenceIndex: 4,
          newFrequency: undefined,
          newLocalStartTime: '11:00',
          newDurationMinutes: undefined,
          newTherapistId: undefined,
          newRoomId: undefined,
          newEndDate: undefined,
          newMaxOccurrences: undefined,
        },
      );
    });

    it('cancelRecurrenceSeries cancels series and future occurrences', async () => {
      (httpClient.post as jest.Mock).mockResolvedValueOnce({
        seriesId: 'series-1',
        cancelledCount: 5,
      });

      await schedulingApi.cancelRecurrenceSeries('series-1', {
        reason: 'Client completed treatment course',
      });

      expect(httpClient.post).toHaveBeenCalledWith(
        '/api/v1/scheduling/recurring-appointments/series-1/cancel',
        {
          reason: 'Client completed treatment course',
        },
      );
    });
  });
});
