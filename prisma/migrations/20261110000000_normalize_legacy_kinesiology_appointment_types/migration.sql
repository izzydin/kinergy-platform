-- ==============================================================================
-- Kinergy Platform - Migration 15: Normalize Legacy Appointment Types
-- Resolves Milestone 11 defect: Invalid appointment type KINESIOLOGY_TREATMENT
-- ==============================================================================

-- Normalize legacy / unmapped appointment type strings to authoritative AppointmentType domain values
UPDATE "appointments"
SET "type" = 'TREATMENT'
WHERE "type" = 'KINESIOLOGY_TREATMENT';

UPDATE "appointments"
SET "type" = 'ASSESSMENT'
WHERE "type" = 'KINESIOLOGY_ASSESSMENT';
