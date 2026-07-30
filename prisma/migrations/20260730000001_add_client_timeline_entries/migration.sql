-- CreateTable: client_timeline_entries
-- Milestone 2.7: Client Activity Feed read model

CREATE TABLE "client_timeline_entries" (
  "id"           TEXT        NOT NULL,
  "client_id"    TEXT        NOT NULL,
  "source_module" TEXT       NOT NULL,
  "event_type"   TEXT        NOT NULL,
  "summary"      TEXT        NOT NULL,
  "metadata"     JSONB       NOT NULL DEFAULT '{}',
  "occurred_at"  TIMESTAMP(3) NOT NULL,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "client_timeline_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: clientId lookup
CREATE INDEX "client_timeline_entries_client_id_idx" ON "client_timeline_entries"("client_id");

-- CreateIndex: eventType filter
CREATE INDEX "client_timeline_entries_event_type_idx" ON "client_timeline_entries"("event_type");

-- CreateIndex: chronological ordering
CREATE INDEX "client_timeline_entries_occurred_at_idx" ON "client_timeline_entries"("occurred_at");

-- AddForeignKey: cascade delete when client is removed (hard delete - not applicable here, but defensive)
ALTER TABLE "client_timeline_entries"
  ADD CONSTRAINT "client_timeline_entries_client_id_fkey"
  FOREIGN KEY ("client_id")
  REFERENCES "clients"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
