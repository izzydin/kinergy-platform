-- Kinergy Platform Database Initialization Script
-- Enables required extensions for UUID generation and cryptographic functions

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
