-- ==============================================================================
-- Kinergy Platform - Migration 14: Align Treatment Sessions & Scheduling Schema
-- Milestone 10.7 Defect Resolution & Persistence Invariant Hardening
-- ==============================================================================

-- 1. Align TreatmentSession SOAP notes columns to match schema.prisma and PrismaTreatmentSessionRepository
ALTER TABLE "treatment_sessions"
  ADD COLUMN IF NOT EXISTS "notes_subjective" TEXT,
  ADD COLUMN IF NOT EXISTS "notes_objective" TEXT,
  ADD COLUMN IF NOT EXISTS "notes_assessment" TEXT,
  ADD COLUMN IF NOT EXISTS "notes_plan" TEXT,
  ADD COLUMN IF NOT EXISTS "notes_raw_text" TEXT;

-- Safely copy over any legacy column values and drop deprecated columns
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'treatment_sessions' AND column_name = 'subjective') THEN
    UPDATE "treatment_sessions" SET "notes_subjective" = "subjective" WHERE "notes_subjective" IS NULL;
    UPDATE "treatment_sessions" SET "notes_objective" = "objective" WHERE "notes_objective" IS NULL;
    UPDATE "treatment_sessions" SET "notes_assessment" = "assessment" WHERE "notes_assessment" IS NULL;
    UPDATE "treatment_sessions" SET "notes_plan" = "plan" WHERE "notes_plan" IS NULL;
    ALTER TABLE "treatment_sessions"
      DROP COLUMN IF EXISTS "subjective",
      DROP COLUMN IF EXISTS "objective",
      DROP COLUMN IF EXISTS "assessment",
      DROP COLUMN IF EXISTS "plan",
      DROP COLUMN IF EXISTS "start_time",
      DROP COLUMN IF EXISTS "end_time",
      DROP COLUMN IF EXISTS "signed_at",
      DROP COLUMN IF EXISTS "signed_by";
  END IF;
END $$;

-- 2. Align RecurrenceSeries columns to match schema.prisma and scheduling domain
ALTER TABLE "recurrence_series"
  ADD COLUMN IF NOT EXISTS "client_id" TEXT,
  ADD COLUMN IF NOT EXISTS "therapist_id" TEXT,
  ADD COLUMN IF NOT EXISTS "room_id" TEXT,
  ADD COLUMN IF NOT EXISTS "service_type" TEXT DEFAULT 'STANDARD',
  ADD COLUMN IF NOT EXISTS "duration_minutes" INTEGER DEFAULT 60,
  ADD COLUMN IF NOT EXISTS "local_start_hour" INTEGER DEFAULT 9,
  ADD COLUMN IF NOT EXISTS "local_start_minute" INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "max_occurrences" INTEGER,
  ADD COLUMN IF NOT EXISTS "timezone" TEXT DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS "cancellation_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "version" INTEGER DEFAULT 1;

-- 3. Align RolePermission updatedAt column
ALTER TABLE "role_permissions"
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 4. Create missing composite scheduling and membership indexes
CREATE INDEX IF NOT EXISTS "appointments_client_id_start_time_end_time_idx" ON "appointments"("client_id", "start_time", "end_time");
CREATE INDEX IF NOT EXISTS "appointments_therapist_id_start_time_end_time_idx" ON "appointments"("therapist_id", "start_time", "end_time");
CREATE INDEX IF NOT EXISTS "appointments_room_id_start_time_end_time_idx" ON "appointments"("room_id", "start_time", "end_time");
CREATE INDEX IF NOT EXISTS "memberships_status_end_date_idx" ON "memberships"("status", "end_date");

