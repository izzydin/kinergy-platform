/**
 * Shared Type Definitions for Kinergy Platform
 */

export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;

export type EntityId = string;

export interface Result<T, E = Error> {
  success: boolean;
  data?: T;
  error?: E;
}

export type ThemeMode = 'light' | 'dark' | 'system';
