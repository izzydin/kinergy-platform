import { registerAs } from '@nestjs/config';

export interface DatabaseConfig {
  url: string;
  maxConnections?: number;
  ssl?: boolean;
}

export const databaseConfig = registerAs('database', (): DatabaseConfig => ({
  url:
    process.env['DATABASE_URL'] ||
    'postgresql://postgres:postgres@localhost:5432/kinergy_db?schema=public',
  maxConnections: Number(process.env['DATABASE_MAX_CONNECTIONS']) || 10,
  ssl: process.env['DATABASE_SSL'] === 'true',
}));
