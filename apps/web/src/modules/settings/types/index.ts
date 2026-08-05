/**
 * Settings Feature Module Types & View Models
 */

export interface GeneralSettingsFormValues {
  readonly workspaceName: string;
  readonly adminEmail: string;
  readonly timezone: string;
}

export interface SecuritySettingsFormValues {
  readonly enforceMfa: boolean;
  readonly sessionTimeoutMinutes: number;
}
