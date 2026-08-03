import { OnAppointmentCreatedEventHandler } from './on-appointment-created.event-handler';
import { OnAppointmentCancelledEventHandler } from './on-appointment-cancelled.event-handler';
import { OnAppointmentRescheduledEventHandler } from './on-appointment-rescheduled.event-handler';
import { OnAppointmentCompletedEventHandler } from './on-appointment-completed.event-handler';
import { OnAppointmentNoShowEventHandler } from './on-appointment-no-show.event-handler';
import { AppointmentCreatedEvent } from '../../../domain/events/appointment-created.event';
import { AppointmentCancelledEvent } from '../../../domain/events/appointment-cancelled.event';
import { AppointmentRescheduledEvent } from '../../../domain/events/appointment-rescheduled.event';
import { AppointmentCompletedEvent } from '../../../domain/events/appointment-completed.event';
import { AppointmentNoShowEvent } from '../../../domain/events/appointment-no-show.event';
import { TimeRange } from '../../../domain/value-objects/time-range.vo';
import {
  AppointmentType,
  AppointmentTypeEnum,
} from '../../../domain/value-objects/appointment-type.vo';

describe('Domain Event Handlers', () => {
  const now = new Date('2026-08-03T10:00:00.000Z');
  const apptType = AppointmentType.create(AppointmentTypeEnum.TREATMENT);
  const timeRange = TimeRange.create(
    new Date('2026-08-03T11:00:00.000Z'),
    new Date('2026-08-03T12:00:00.000Z'),
  );

  describe('OnAppointmentCreatedEventHandler', () => {
    it('should process AppointmentCreatedEvent and track in history', async () => {
      const handler = new OnAppointmentCreatedEventHandler();
      const event = new AppointmentCreatedEvent(
        'appt_1',
        'client_1',
        'therapist_1',
        'room_1',
        apptType,
        timeRange,
        1,
        now,
      );

      await handler.handle(event);

      const events = handler.getHandledEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.aggregateId).toBe('appt_1');
    });
  });

  describe('OnAppointmentCancelledEventHandler', () => {
    it('should process AppointmentCancelledEvent and track in history', async () => {
      const handler = new OnAppointmentCancelledEventHandler();
      const event = new AppointmentCancelledEvent('appt_1', 'Client sick', 2, now);

      await handler.handle(event);

      const events = handler.getHandledEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.reason).toBe('Client sick');
    });
  });

  describe('OnAppointmentRescheduledEventHandler', () => {
    it('should process AppointmentRescheduledEvent and track in history', async () => {
      const handler = new OnAppointmentRescheduledEventHandler();
      const newRange = TimeRange.create(
        new Date('2026-08-04T11:00:00.000Z'),
        new Date('2026-08-04T12:00:00.000Z'),
      );
      const event = new AppointmentRescheduledEvent('appt_1', timeRange, newRange, 2, now);

      await handler.handle(event);

      const events = handler.getHandledEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.newTimeRange.equals(newRange)).toBe(true);
    });
  });

  describe('OnAppointmentCompletedEventHandler', () => {
    it('should process AppointmentCompletedEvent and track in history', async () => {
      const handler = new OnAppointmentCompletedEventHandler();
      const event = new AppointmentCompletedEvent('appt_1', 5, now);

      await handler.handle(event);

      const events = handler.getHandledEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.aggregateId).toBe('appt_1');
    });
  });

  describe('OnAppointmentNoShowEventHandler', () => {
    it('should process AppointmentNoShowEvent and track in history', async () => {
      const handler = new OnAppointmentNoShowEventHandler();
      const event = new AppointmentNoShowEvent('appt_1', 'Client absent', 2, now);

      await handler.handle(event);

      const events = handler.getHandledEvents();
      expect(events).toHaveLength(1);
      expect(events[0]?.payload.reason).toBe('Client absent');
    });
  });
});
