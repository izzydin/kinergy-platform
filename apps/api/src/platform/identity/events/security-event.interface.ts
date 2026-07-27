/**
 * Supported Security Event Discriminators across the Platform.
 */
export type SecurityEventType =
  | 'LoginSucceeded'
  | 'LoginFailed'
  | 'LogoutSucceeded'
  | 'RefreshTokenRotated'
  | 'RefreshTokenReplayDetected'
  | 'PasswordChanged';

/**
 * Base Security Event Interface.
 * Standardizes security payload attributes across domain operations.
 */
export interface BaseSecurityEvent {
  eventId: string;
  eventType: SecurityEventType;
  timestamp: Date;
  userId?: string | null;
  email?: string | null;
  tenantId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

export interface LoginSucceededEvent extends BaseSecurityEvent {
  eventType: 'LoginSucceeded';
  userId: string;
  email: string;
}

export interface LoginFailedEvent extends BaseSecurityEvent {
  eventType: 'LoginFailed';
  email: string;
  reason: string;
}

export interface LogoutSucceededEvent extends BaseSecurityEvent {
  eventType: 'LogoutSucceeded';
  userId: string;
}

export interface RefreshTokenRotatedEvent extends BaseSecurityEvent {
  eventType: 'RefreshTokenRotated';
  userId: string;
  familyId: string;
}

export interface RefreshTokenReplayDetectedEvent extends BaseSecurityEvent {
  eventType: 'RefreshTokenReplayDetected';
  userId: string;
  familyId: string;
}

export interface PasswordChangedEvent extends BaseSecurityEvent {
  eventType: 'PasswordChanged';
  userId: string;
}

export type SecurityEvent =
  | LoginSucceededEvent
  | LoginFailedEvent
  | LogoutSucceededEvent
  | RefreshTokenRotatedEvent
  | RefreshTokenReplayDetectedEvent
  | PasswordChangedEvent;
