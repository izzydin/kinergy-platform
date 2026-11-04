-- Baseline Migration: Core IAM, Clients, Scheduling, Clinical & Gym Entities
-- Establishes the foundational schema prior to incremental domain migrations

-- 1. Enums
CREATE TYPE "UserStatus" AS ENUM ('PENDING_ACTIVATION', 'ACTIVE', 'LOCKED', 'SUSPENDED', 'DEACTIVATED');
CREATE TYPE "RoleType" AS ENUM ('SYSTEM', 'CUSTOM');
CREATE TYPE "RecurrenceFrequency" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY');
CREATE TYPE "SeriesStatus" AS ENUM ('ACTIVE', 'CANCELLED');
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED');
CREATE TYPE "ExceptionType" AS ENUM ('SKIPPED', 'MODIFIED');
CREATE TYPE "SessionStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');
CREATE TYPE "MembershipStatus" AS ENUM ('PENDING', 'ACTIVE', 'FROZEN', 'EXPIRED', 'CANCELLED', 'TERMINATED');
CREATE TYPE "PlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE "CheckInMethod" AS ENUM ('QR_CODE', 'BARCODE', 'RFID', 'MANUAL_RECEPTION', 'BIOMETRIC');
CREATE TYPE "AccessResult" AS ENUM ('GRANTED', 'DENIED_NO_MEMBERSHIP', 'DENIED_EXPIRED', 'DENIED_FROZEN', 'DENIED_INACTIVE_CLIENT', 'DENIED_OUT_OF_HOURS', 'DENIED_FACILITY_MISMATCH', 'DENIED_DUPLICATE_CHECKIN', 'DENIED_QUOTA_EXCEEDED', 'DENIED_SYSTEM_ERROR');

-- 2. IAM (Identity & Access Management)
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "RoleType" NOT NULL DEFAULT 'CUSTOM',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING_ACTIVATION',
    "role_id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "family_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "is_revoked" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- 3. Clients Domain
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "reference_number" TEXT NOT NULL,
    "identity_id" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "normalized_email" TEXT NOT NULL,
    "normalized_phone" TEXT NOT NULL,
    "normalized_search_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- 4. Scheduling Domain
CREATE TABLE "recurrence_series" (
    "id" TEXT NOT NULL,
    "frequency" "RecurrenceFrequency" NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "total_occurrences" INTEGER,
    "status" "SeriesStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "recurrence_series_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "recurrence_exceptions" (
    "id" TEXT NOT NULL,
    "series_id" TEXT NOT NULL,
    "occurrence_index" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" "ExceptionType" NOT NULL DEFAULT 'SKIPPED',
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "recurrence_exceptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "therapist_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "series_id" TEXT,
    "occurrence_index" INTEGER,
    "is_detached_from_series" BOOLEAN NOT NULL DEFAULT false,
    "cancellation_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "appointment_notes" (
    "id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "note_text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "appointment_notes_pkey" PRIMARY KEY ("id")
);

-- 5. Kinesiology Domain
CREATE TABLE "treatment_sessions" (
    "id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "therapist_id" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3),
    "subjective" TEXT,
    "objective" TEXT,
    "assessment" TEXT,
    "plan" TEXT,
    "cancellation_reason" TEXT,
    "signed_at" TIMESTAMP(3),
    "signed_by" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "treatment_sessions_pkey" PRIMARY KEY ("id")
);

-- 6. Gym Management Domain
CREATE TABLE "membership_plans" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "duration_days" INTEGER NOT NULL,
    "price_amount" DECIMAL(10,2) NOT NULL,
    "price_currency" TEXT NOT NULL DEFAULT 'USD',
    "visit_quota" INTEGER,
    "status" "PlanStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "membership_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "assigned_trainer_id" TEXT,
    "freeze_history" JSONB NOT NULL DEFAULT '[]',
    "cancellation_reason" TEXT,
    "termination_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "attendance_records" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "membership_id" TEXT,
    "check_in_time" TIMESTAMP(3) NOT NULL,
    "gym_day" TEXT NOT NULL,
    "method" "CheckInMethod" NOT NULL,
    "result" "AccessResult" NOT NULL,
    "gate_id" TEXT,
    "receptionist_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- 7. Indexes & Unique Constraints
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");
CREATE INDEX "roles_name_idx" ON "roles"("name");
CREATE INDEX "roles_type_idx" ON "roles"("type");

CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");
CREATE INDEX "permissions_code_idx" ON "permissions"("code");

CREATE INDEX "role_permissions_role_id_idx" ON "role_permissions"("role_id");
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");
CREATE UNIQUE INDEX "role_permissions_role_id_permission_id_key" ON "role_permissions"("role_id", "permission_id");

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_email_idx" ON "users"("email");
CREATE INDEX "users_role_id_idx" ON "users"("role_id");
CREATE INDEX "users_status_idx" ON "users"("status");
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");

CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");
CREATE INDEX "refresh_tokens_token_hash_idx" ON "refresh_tokens"("token_hash");

CREATE UNIQUE INDEX "clients_reference_number_key" ON "clients"("reference_number");
CREATE UNIQUE INDEX "clients_email_key" ON "clients"("email");
CREATE INDEX "clients_reference_number_idx" ON "clients"("reference_number");
CREATE INDEX "clients_status_idx" ON "clients"("status");
CREATE INDEX "clients_normalized_search_name_idx" ON "clients"("normalized_search_name");
CREATE INDEX "clients_normalized_email_idx" ON "clients"("normalized_email");
CREATE INDEX "clients_normalized_phone_idx" ON "clients"("normalized_phone");
CREATE INDEX "clients_identity_id_idx" ON "clients"("identity_id");

CREATE INDEX "recurrence_series_status_idx" ON "recurrence_series"("status");
CREATE INDEX "recurrence_series_start_date_end_date_idx" ON "recurrence_series"("start_date", "end_date");

CREATE INDEX "recurrence_exceptions_series_id_occurrence_index_idx" ON "recurrence_exceptions"("series_id", "occurrence_index");
CREATE INDEX "recurrence_exceptions_date_idx" ON "recurrence_exceptions"("date");
CREATE UNIQUE INDEX "recurrence_exceptions_series_id_occurrence_index_key" ON "recurrence_exceptions"("series_id", "occurrence_index");

CREATE INDEX "appointments_client_id_idx" ON "appointments"("client_id");
CREATE INDEX "appointments_therapist_id_idx" ON "appointments"("therapist_id");
CREATE INDEX "appointments_room_id_idx" ON "appointments"("room_id");
CREATE INDEX "appointments_status_idx" ON "appointments"("status");
CREATE INDEX "appointments_start_time_end_time_idx" ON "appointments"("start_time", "end_time");
CREATE INDEX "appointments_series_id_idx" ON "appointments"("series_id");

CREATE INDEX "appointment_notes_appointment_id_idx" ON "appointment_notes"("appointment_id");
CREATE INDEX "appointment_notes_author_id_idx" ON "appointment_notes"("author_id");

CREATE UNIQUE INDEX "treatment_sessions_appointment_id_key" ON "treatment_sessions"("appointment_id");
CREATE INDEX "treatment_sessions_appointment_id_idx" ON "treatment_sessions"("appointment_id");
CREATE INDEX "treatment_sessions_client_id_created_at_idx" ON "treatment_sessions"("client_id", "created_at" DESC);
CREATE INDEX "treatment_sessions_therapist_id_idx" ON "treatment_sessions"("therapist_id");
CREATE INDEX "treatment_sessions_status_idx" ON "treatment_sessions"("status");

CREATE UNIQUE INDEX "membership_plans_code_key" ON "membership_plans"("code");
CREATE INDEX "membership_plans_status_idx" ON "membership_plans"("status");
CREATE INDEX "membership_plans_code_idx" ON "membership_plans"("code");

CREATE INDEX "memberships_client_id_status_idx" ON "memberships"("client_id", "status");
CREATE INDEX "memberships_plan_id_idx" ON "memberships"("plan_id");
CREATE INDEX "memberships_status_idx" ON "memberships"("status");
CREATE INDEX "memberships_end_date_idx" ON "memberships"("end_date");
CREATE INDEX "memberships_assigned_trainer_id_idx" ON "memberships"("assigned_trainer_id");

CREATE INDEX "attendance_records_client_id_check_in_time_idx" ON "attendance_records"("client_id", "check_in_time" DESC);
CREATE INDEX "attendance_records_gym_day_idx" ON "attendance_records"("gym_day");
CREATE INDEX "attendance_records_membership_id_idx" ON "attendance_records"("membership_id");
CREATE INDEX "attendance_records_result_idx" ON "attendance_records"("result");

-- 8. Foreign Key Constraints
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recurrence_exceptions" ADD CONSTRAINT "recurrence_exceptions_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "recurrence_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "recurrence_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "appointment_notes" ADD CONSTRAINT "appointment_notes_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "membership_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
