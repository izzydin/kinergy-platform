-- ============================================================================
-- Migration: 20261123103500_add_ai_conversation_persistence
-- Module: Kynergy Intelligence Conversation Persistence (AI-09.3)
-- ============================================================================

-- 1. Create Enums
CREATE TYPE "ConversationRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');
CREATE TYPE "GenerationStatus" AS ENUM ('PENDING', 'STREAMING', 'SUCCESS', 'FAILED', 'CANCELLED', 'INTERRUPTED');
CREATE TYPE "TurnStatus" AS ENUM ('PENDING', 'STREAMING', 'COMPLETED', 'FAILED', 'CANCELLED', 'INTERRUPTED');

-- 2. Create ai_conversations Table
CREATE TABLE "ai_conversations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" VARCHAR(255) NOT NULL DEFAULT 'New Conversation',
    "idempotency_key" VARCHAR(64),
    "turn_counter" INTEGER NOT NULL DEFAULT 0,
    "message_counter" INTEGER NOT NULL DEFAULT 0,
    "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- 3. Create ai_conversation_turns Table
CREATE TABLE "ai_conversation_turns" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "turn_index" INTEGER NOT NULL,
    "status" "TurnStatus" NOT NULL DEFAULT 'PENDING',
    "client_turn_id" VARCHAR(64) NOT NULL,
    "idempotency_key" VARCHAR(64) NOT NULL,
    "idempotency_payload_hash" VARCHAR(64) NOT NULL,
    "active_attempt_id" TEXT,
    "active_attempt_number" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_conversation_turns_pkey" PRIMARY KEY ("id")
);

-- 4. Create ai_conversation_messages Table
CREATE TABLE "ai_conversation_messages" (
    "id" TEXT NOT NULL,
    "turn_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "role" "ConversationRole" NOT NULL,
    "sequence_number" INTEGER NOT NULL,
    "attempt_number" INTEGER NOT NULL DEFAULT 1,
    "is_canonical" BOOLEAN NOT NULL DEFAULT false,
    "status" "GenerationStatus" NOT NULL DEFAULT 'PENDING',
    "content" TEXT NOT NULL DEFAULT '',
    "sources" JSONB,
    "metadata" JSONB,
    "error_code" VARCHAR(64),
    "error_message" TEXT,
    "client_message_id" VARCHAR(64),
    "lease_token" VARCHAR(64),
    "lease_owner_instance_id" VARCHAR(128),
    "lease_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_conversation_messages_pkey" PRIMARY KEY ("id")
);

-- 5. Create ai_conversation_audit_logs Table (Retained Snapshot Model)
CREATE TABLE "ai_conversation_audit_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "conversation_title_snapshot" VARCHAR(255) NOT NULL,
    "conversation_owner_user_id" TEXT NOT NULL,
    "inspector_user_id" TEXT NOT NULL,
    "inspector_role" VARCHAR(64) NOT NULL,
    "action" VARCHAR(64) NOT NULL DEFAULT 'CLINICAL_CONVERSATION_INSPECTED',
    "reason" TEXT NOT NULL,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_conversation_audit_logs_pkey" PRIMARY KEY ("id")
);

-- 6. Create Indexes and Unique Constraints on ai_conversations
CREATE UNIQUE INDEX "ai_conversations_id_tenant_id_key" ON "ai_conversations"("id", "tenant_id");
CREATE UNIQUE INDEX "ai_conversations_tenant_id_user_id_idempotency_key_key" ON "ai_conversations"("tenant_id", "user_id", "idempotency_key");
CREATE INDEX "idx_conversation_user_active_list" ON "ai_conversations"("tenant_id", "user_id", "deleted_at", "last_activity_at" DESC);
CREATE INDEX "idx_conversation_tenant_audit_list" ON "ai_conversations"("tenant_id", "deleted_at", "last_activity_at" DESC);

-- 7. Create Indexes and Unique Constraints on ai_conversation_turns
CREATE UNIQUE INDEX "ai_conversation_turns_id_conversation_id_tenant_id_key" ON "ai_conversation_turns"("id", "conversation_id", "tenant_id");
CREATE UNIQUE INDEX "ai_conversation_turns_conversation_id_turn_index_key" ON "ai_conversation_turns"("conversation_id", "turn_index");
CREATE UNIQUE INDEX "ai_conversation_turns_conversation_id_idempotency_key_key" ON "ai_conversation_turns"("conversation_id", "idempotency_key");
CREATE UNIQUE INDEX "ai_conversation_turns_tenant_id_client_turn_id_key" ON "ai_conversation_turns"("tenant_id", "client_turn_id");
CREATE INDEX "idx_turn_conversation_status" ON "ai_conversation_turns"("conversation_id", "status");

-- 8. Create Indexes and Unique Constraints on ai_conversation_messages
CREATE UNIQUE INDEX "ai_conversation_messages_id_turn_id_conversation_id_tenant__key" ON "ai_conversation_messages"("id", "turn_id", "conversation_id", "tenant_id");
CREATE UNIQUE INDEX "ai_conversation_messages_conversation_id_sequence_number_key" ON "ai_conversation_messages"("conversation_id", "sequence_number");
CREATE INDEX "idx_message_turn_role" ON "ai_conversation_messages"("turn_id", "role");
CREATE INDEX "idx_message_history_cursor" ON "ai_conversation_messages"("conversation_id", "created_at" ASC);

-- 9. Create Indexes on ai_conversation_audit_logs
CREATE INDEX "idx_audit_conversation" ON "ai_conversation_audit_logs"("tenant_id", "conversation_id", "created_at" DESC);
CREATE INDEX "idx_audit_inspector" ON "ai_conversation_audit_logs"("inspector_user_id", "created_at" DESC);

-- 10. Add Foreign Keys with Multi-Tenant Composite Cascade
ALTER TABLE "ai_conversation_turns"
    ADD CONSTRAINT "ai_conversation_turns_conversation_id_tenant_id_fkey"
    FOREIGN KEY ("conversation_id", "tenant_id")
    REFERENCES "ai_conversations"("id", "tenant_id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_conversation_messages"
    ADD CONSTRAINT "ai_conversation_messages_conversation_id_tenant_id_fkey"
    FOREIGN KEY ("conversation_id", "tenant_id")
    REFERENCES "ai_conversations"("id", "tenant_id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_conversation_messages"
    ADD CONSTRAINT "ai_conversation_messages_turn_id_conversation_id_tenant_id_fkey"
    FOREIGN KEY ("turn_id", "conversation_id", "tenant_id")
    REFERENCES "ai_conversation_turns"("id", "conversation_id", "tenant_id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Single-column FK for active attempt pointer with SET NULL
ALTER TABLE "ai_conversation_turns"
    ADD CONSTRAINT "ai_conversation_turns_active_attempt_id_fkey"
    FOREIGN KEY ("active_attempt_id")
    REFERENCES "ai_conversation_messages"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- 11. Partial Unique Indexes
-- Partial Index: Only one active ASSISTANT generation (PENDING or STREAMING) per conversation
CREATE UNIQUE INDEX "ai_conversation_active_generation_idx"
    ON "ai_conversation_messages"("conversation_id")
    WHERE "role" = 'ASSISTANT' AND "status" IN ('PENDING', 'STREAMING');

-- Partial Index: Exactly one user message per logical turn
CREATE UNIQUE INDEX "uq_turn_single_user_message"
    ON "ai_conversation_messages"("turn_id")
    WHERE "role" = 'USER';

-- Partial Index: At most one canonical assistant message per logical turn
CREATE UNIQUE INDEX "uq_turn_single_canonical_assistant"
    ON "ai_conversation_messages"("turn_id")
    WHERE "role" = 'ASSISTANT' AND "is_canonical" = TRUE;

-- 12. PostgreSQL Check Constraints
-- Canonical message requires SUCCESS status
ALTER TABLE "ai_conversation_messages"
    ADD CONSTRAINT "chk_canonical_requires_success"
    CHECK ("is_canonical" = FALSE OR ("role" = 'ASSISTANT' AND "status" = 'SUCCESS'));

-- Terminal attempts cannot retain active leases
ALTER TABLE "ai_conversation_messages"
    ADD CONSTRAINT "chk_terminal_attempt_no_active_lease"
    CHECK (
        "status" IN ('PENDING', 'STREAMING')
        OR ("lease_token" IS NULL AND "lease_owner_instance_id" IS NULL AND "lease_expires_at" IS NULL)
    );

-- Range validations
ALTER TABLE "ai_conversation_turns"
    ADD CONSTRAINT "chk_turn_index_positive"
    CHECK ("turn_index" >= 1);

ALTER TABLE "ai_conversation_turns"
    ADD CONSTRAINT "chk_active_attempt_number_positive"
    CHECK ("active_attempt_number" >= 1);

ALTER TABLE "ai_conversation_messages"
    ADD CONSTRAINT "chk_sequence_number_positive"
    CHECK ("sequence_number" >= 1);

ALTER TABLE "ai_conversation_messages"
    ADD CONSTRAINT "chk_attempt_number_positive"
    CHECK ("attempt_number" >= 1);

-- 13. Relational Triggers
-- Deferred trigger: Validate that active_attempt_id belongs to the exact same turn, conversation, tenant, and has role ASSISTANT
CREATE OR REPLACE FUNCTION validate_turn_active_attempt_membership()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.active_attempt_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM "ai_conversation_messages" m
            WHERE m."id" = NEW.active_attempt_id
              AND m."turn_id" = NEW."id"
              AND m."conversation_id" = NEW."conversation_id"
              AND m."tenant_id" = NEW."tenant_id"
              AND m."role" = 'ASSISTANT'
        ) THEN
            RAISE EXCEPTION 'Constraint violation: active_attempt_id % must reference an ASSISTANT message in the same turn %, conversation %, and tenant %',
                NEW.active_attempt_id, NEW.id, NEW.conversation_id, NEW.tenant_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_validate_turn_active_attempt
    AFTER INSERT OR UPDATE OF active_attempt_id ON "ai_conversation_turns"
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION validate_turn_active_attempt_membership();

-- Immutability trigger: Protect message role and parent bindings from post-insertion mutation
CREATE OR REPLACE FUNCTION prevent_message_relational_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.role <> NEW.role) THEN
        RAISE EXCEPTION 'Constraint violation: message role is immutable once inserted.';
    END IF;
    IF (OLD.turn_id <> NEW.turn_id OR OLD.conversation_id <> NEW.conversation_id OR OLD.tenant_id <> NEW.tenant_id) THEN
        RAISE EXCEPTION 'Constraint violation: message parent bindings (turn_id, conversation_id, tenant_id) are immutable.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_protect_message_immutability
    BEFORE UPDATE ON "ai_conversation_messages"
    FOR EACH ROW
    EXECUTE FUNCTION prevent_message_relational_mutation();

-- 14. Permission Seed: Register ai.conversations.audit and grant to Owner
INSERT INTO "permissions" ("id", "code", "description", "created_at", "updated_at")
VALUES (
    gen_random_uuid()::text,
    'ai.conversations.audit',
    'Audit and inspect persistent AI conversation histories and clinical interactions',
    NOW(),
    NOW()
)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at", "updated_at")
SELECT 
    gen_random_uuid()::text,
    r.id,
    p.id,
    NOW(),
    NOW()
FROM "roles" r
JOIN "permissions" p ON p.code = 'ai.conversations.audit'
WHERE r.name = 'Owner'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
