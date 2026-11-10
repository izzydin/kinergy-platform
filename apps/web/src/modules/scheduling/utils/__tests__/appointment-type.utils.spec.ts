import {
  APPOINTMENT_TYPE_DISPLAY_CONFIGS,
  formatAppointmentTypeLabel,
  isSupportedAppointmentType,
  validateAppointmentType,
} from '../appointment-type.utils';
import { APPOINTMENT_TYPES, type AppointmentType } from '../../types/scheduling.types';

describe('Appointment Type Contract & Calendar Display Utilities', () => {
  const backendSupportedTypes: AppointmentType[] = [
    'ASSESSMENT',
    'FOLLOW_UP',
    'TREATMENT',
    'EVALUATION',
    'RENTAL',
    'GROUP_CLASS',
  ];

  describe('Contract Alignment', () => {
    it('accepts every valid backend domain appointment type in the frontend contract', () => {
      expect(APPOINTMENT_TYPES).toEqual(backendSupportedTypes);
      for (const type of backendSupportedTypes) {
        expect(isSupportedAppointmentType(type)).toBe(true);
      }
    });

    it('provides explicit and exhaustive display configuration for all valid appointment types', () => {
      for (const type of backendSupportedTypes) {
        const config = APPOINTMENT_TYPE_DISPLAY_CONFIGS[type];
        expect(config).toBeDefined();
        expect(config.type).toBe(type);
        expect(config.label).toBeTruthy();
        expect(config.shortLabel).toBeTruthy();
        expect(config.description).toBeTruthy();
        expect(config.badgeClass).toBeTruthy();
      }
    });
  });

  describe('formatAppointmentTypeLabel', () => {
    it('formats TREATMENT to Kinesiology Treatment Session', () => {
      expect(formatAppointmentTypeLabel('TREATMENT')).toBe('Kinesiology Treatment Session');
    });

    it('formats ASSESSMENT to Initial Clinical Assessment', () => {
      expect(formatAppointmentTypeLabel('ASSESSMENT')).toBe('Initial Clinical Assessment');
    });

    it('formats all remaining valid appointment types to descriptive labels', () => {
      expect(formatAppointmentTypeLabel('FOLLOW_UP')).toBe('Follow-Up Session');
      expect(formatAppointmentTypeLabel('EVALUATION')).toBe('Functional Re-Evaluation');
      expect(formatAppointmentTypeLabel('RENTAL')).toBe('Facility / Studio Rental');
      expect(formatAppointmentTypeLabel('GROUP_CLASS')).toBe('Group Movement Class');
    });

    it('falls back to Standard Session for null, undefined, or empty values', () => {
      expect(formatAppointmentTypeLabel(undefined)).toBe('Standard Session');
      expect(formatAppointmentTypeLabel(null)).toBe('Standard Session');
      expect(formatAppointmentTypeLabel('')).toBe('Standard Session');
    });

    it('preserves unrecognized strings safely without throwing or silently corrupting', () => {
      expect(formatAppointmentTypeLabel('CUSTOM_EXPERIMENT')).toBe('CUSTOM_EXPERIMENT');
    });
  });

  describe('validateAppointmentType (Controlled Diagnostics)', () => {
    it('validates all supported backend appointment types successfully', () => {
      for (const type of backendSupportedTypes) {
        const result = validateAppointmentType(type);
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      }
    });

    it('produces a controlled diagnosable error for truly unsupported appointment types', () => {
      const result = validateAppointmentType('KINESIOLOGY_TREATMENT');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("Unsupported appointment type: 'KINESIOLOGY_TREATMENT'");
      expect(result.error).toContain('TREATMENT');
    });

    it('produces a controlled error when type is missing or null', () => {
      expect(validateAppointmentType(undefined).isValid).toBe(false);
      expect(validateAppointmentType(null).isValid).toBe(false);
      expect(validateAppointmentType('').isValid).toBe(false);
    });
  });
});
