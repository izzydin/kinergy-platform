-- ============================================================================
-- Migration: 20261125110000_add_ai_message_feedback
-- Module: Kynergy Intelligence Response Feedback (AI-09.5 - FB.02)
-- ============================================================================

-- 1. Create Enum: FeedbackRating
CREATE TYPE "FeedbackRating" AS ENUM ('POSITIVE', 'NEGATIVE');

-- 2. Create Table: ai_message_feedback
CREATE TABLE "ai_message_feedback" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "rating" "FeedbackRating" NOT NULL,
    "explanation" TEXT,
    "category" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_message_feedback_pkey" PRIMARY KEY ("id")
);

-- 3. Create Unique Constraints
CREATE UNIQUE INDEX "ai_message_feedback_message_id_user_id_key" 
    ON "ai_message_feedback"("message_id", "user_id");

CREATE UNIQUE INDEX "ai_message_feedback_id_tenant_id_key" 
    ON "ai_message_feedback"("id", "tenant_id");

-- 4. Create Performance Indexes
CREATE INDEX "idx_feedback_conversation" 
    ON "ai_message_feedback"("conversation_id");

CREATE INDEX "idx_feedback_tenant_user" 
    ON "ai_message_feedback"("tenant_id", "user_id");

CREATE INDEX "idx_feedback_message" 
    ON "ai_message_feedback"("message_id");

-- 5. Create Foreign Key Constraints with Cascade
ALTER TABLE "ai_message_feedback"
    ADD CONSTRAINT "ai_message_feedback_message_id_fkey"
    FOREIGN KEY ("message_id")
    REFERENCES "ai_conversation_messages"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_message_feedback"
    ADD CONSTRAINT "ai_message_feedback_conversation_id_tenant_id_fkey"
    FOREIGN KEY ("conversation_id", "tenant_id")
    REFERENCES "ai_conversations"("id", "tenant_id")
    ON DELETE CASCADE ON UPDATE CASCADE;
