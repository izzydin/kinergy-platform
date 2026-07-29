/**
 * Core categories for classification of audit events across the platform.
 */
export enum AuditEventCategory {
  AUTHENTICATION = 'AUTHENTICATION',
  IDENTITY_ADMINISTRATION = 'IDENTITY_ADMINISTRATION',
  AUTHORIZATION_ACCESS = 'AUTHORIZATION_ACCESS',
  SYSTEM_SECURITY = 'SYSTEM_SECURITY',
  DATA_ACCESS = 'DATA_ACCESS',
}

/**
 * Standardized audit event action types across system contexts.
 */
export enum AuditEventType {
  // Authentication Events
  LOGIN_SUCCEEDED = 'LOGIN_SUCCEEDED',
  LOGIN_FAILED = 'LOGIN_FAILED',
  LOGOUT = 'LOGOUT',
  TOKEN_REFRESHED = 'TOKEN_REFRESHED',
  PASSWORD_CHANGED = 'PASSWORD_CHANGED',
  PASSWORD_RESET = 'PASSWORD_RESET',

  // Identity Administration Events
  USER_CREATED = 'USER_CREATED',
  USER_UPDATED = 'USER_UPDATED',
  USER_DEACTIVATED = 'USER_DEACTIVATED',
  USER_ACTIVATED = 'USER_ACTIVATED',
  USER_DELETED = 'USER_DELETED',

  // Authorization & Access Control Events
  PERMISSION_GRANTED = 'PERMISSION_GRANTED',
  ROLE_ASSIGNED = 'ROLE_ASSIGNED',
  ACCESS_DENIED = 'ACCESS_DENIED',

  // System & Security Events
  CONFIGURATION_CHANGED = 'CONFIGURATION_CHANGED',
  SECURITY_ALERT = 'SECURITY_ALERT',
}

/**
 * Severity level of the audited event.
 */
export enum AuditSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

/**
 * Outcome status of the audited operation.
 */
export enum AuditOutcome {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
  DENIED = 'DENIED',
}
