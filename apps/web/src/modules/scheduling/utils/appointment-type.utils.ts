import type { AppointmentType } from '../types/scheduling.types';
import { APPOINTMENT_TYPES } from '../types/scheduling.types';

/**
 * Visual and textual display configuration for appointment types.
 * Exhaustive across all valid backend AppointmentTypeEnum values.
 */
export interface AppointmentTypeDisplayConfig {
  readonly type: AppointmentType;
  readonly label: string;
  readonly shortLabel: string;
  readonly description: string;
  readonly badgeClass: string;
}

/**
 * Authoritative, exhaustive display configurations for all supported appointment types.
 * Ensures calendar cards, drawer views, and agenda grids format appointments consistently.
 */
export const APPOINTMENT_TYPE_DISPLAY_CONFIGS: Record<
  AppointmentType,
  AppointmentTypeDisplayConfig
> = {
  ASSESSMENT: {
    type: 'ASSESSMENT',
    label: 'Initial Clinical Assessment',
    shortLabel: 'Assessment',
    description: 'Initial intake and musculoskeletal clinical evaluation',
    badgeClass:
      'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:border-blue-500/40 dark:bg-blue-950/30 dark:text-blue-300',
  },
  TREATMENT: {
    type: 'TREATMENT',
    label: 'Kinesiology Treatment Session',
    shortLabel: 'Treatment',
    description: 'Targeted kinesiology therapy and active clinical rehabilitation',
    badgeClass:
      'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-950/30 dark:text-emerald-300',
  },
  FOLLOW_UP: {
    type: 'FOLLOW_UP',
    label: 'Follow-Up Session',
    shortLabel: 'Follow-Up',
    description: 'Review of clinical progress and exercise adjustments',
    badgeClass:
      'border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-950/30 dark:text-indigo-300',
  },
  EVALUATION: {
    type: 'EVALUATION',
    label: 'Functional Re-Evaluation',
    shortLabel: 'Evaluation',
    description: 'Periodic objective milestone measurement and re-assessment',
    badgeClass:
      'border-purple-500/30 bg-purple-500/10 text-purple-700 dark:border-purple-500/40 dark:bg-purple-950/30 dark:text-purple-300',
  },
  RENTAL: {
    type: 'RENTAL',
    label: 'Facility / Studio Rental',
    shortLabel: 'Rental',
    description: 'Private facility and therapeutic room reservation',
    badgeClass:
      'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-300',
  },
  GROUP_CLASS: {
    type: 'GROUP_CLASS',
    label: 'Group Movement Class',
    shortLabel: 'Group Class',
    description: 'Instructor-led group movement or mobility session',
    badgeClass:
      'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:border-cyan-500/40 dark:bg-cyan-950/30 dark:text-cyan-300',
  },
};

/**
 * Type guard verifying if a raw string is a recognized domain appointment type.
 */
export function isSupportedAppointmentType(
  rawType: string | undefined | null,
): rawType is AppointmentType {
  if (!rawType) return false;
  return (APPOINTMENT_TYPES as readonly string[]).includes(rawType);
}

/**
 * Formats an appointment or service type into an authoritative human-readable label.
 * Gracefully preserves existing strings if unmapped, avoiding silent conversion or view crashes.
 */
export function formatAppointmentTypeLabel(rawType: string | undefined | null): string {
  if (!rawType) return 'Standard Session';
  if (isSupportedAppointmentType(rawType)) {
    return APPOINTMENT_TYPE_DISPLAY_CONFIGS[rawType].label;
  }
  return rawType;
}

/**
 * Validates an appointment type against the domain contract.
 * Produces a controlled, diagnosable error for truly unsupported types without throwing uncaught exceptions.
 */
export function validateAppointmentType(rawType: string | undefined | null): {
  isValid: boolean;
  error?: string;
} {
  if (!rawType) {
    return { isValid: false, error: 'Appointment type is required.' };
  }
  if (!isSupportedAppointmentType(rawType)) {
    return {
      isValid: false,
      error: `Unsupported appointment type: '${rawType}'. Expected one of: ${APPOINTMENT_TYPES.join(', ')}.`,
    };
  }
  return { isValid: true };
}
