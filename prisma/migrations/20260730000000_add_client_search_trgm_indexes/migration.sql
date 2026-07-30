-- Enable pg_trgm extension for fast trigram pattern matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create GIN trigram indexes for text search
CREATE INDEX IF NOT EXISTS idx_clients_normalized_search_name_trgm ON clients USING gin (normalized_search_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_clients_email_trgm ON clients USING gin (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_clients_phone_trgm ON clients USING gin (phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_clients_reference_number ON clients (reference_number);
