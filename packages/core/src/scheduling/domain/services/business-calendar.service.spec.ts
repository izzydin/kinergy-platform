import { BusinessCalendarService } from './business-calendar.service';
import { TimeRange } from '../value-objects/time-range.vo';

describe('BusinessCalendarService', () => {
  it('should initialize with clinic open and zero holidays/closures', () => {
    const calendar = new BusinessCalendarService();
    const testDate = new Date('2026-08-03T10:00:00.000Z');

    expect(calendar.isHoliday(testDate)).toBe(false);
    expect(calendar.isClinicOpen(testDate)).toBe(true);
  });

  it('should register public holidays and evaluate closures', () => {
    const calendar = new BusinessCalendarService();
    const christmasDay = new Date('2026-12-25T00:00:00.000Z');

    calendar.addHoliday(christmasDay, 'Christmas Day');

    expect(calendar.isHoliday(christmasDay)).toBe(true);
    expect(calendar.isClinicOpen(christmasDay)).toBe(false);
  });

  it('should register facility closures for specific date ranges', () => {
    const calendar = new BusinessCalendarService();
    const maintenanceRange = TimeRange.create(
      new Date('2026-08-15T08:00:00.000Z'),
      new Date('2026-08-15T18:00:00.000Z'),
    );

    calendar.addClosure(maintenanceRange, 'Annual Facility Maintenance');

    expect(calendar.isClinicOpen(maintenanceRange)).toBe(false);
    expect(
      calendar.isClinicOpen(
        TimeRange.create(
          new Date('2026-08-16T08:00:00.000Z'),
          new Date('2026-08-16T18:00:00.000Z'),
        ),
      ),
    ).toBe(true);
  });
});
