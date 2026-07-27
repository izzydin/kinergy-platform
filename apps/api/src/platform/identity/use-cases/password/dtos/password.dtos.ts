export interface ChangePasswordDto {
  readonly userId: string;
  readonly currentPassword: string;
  readonly newPassword: string;
}

export interface ResetPasswordDto {
  readonly userId: string;
  readonly adminId?: string | null;
}

export interface ResetPasswordResultDto {
  readonly userId: string;
  readonly temporaryPassword: string;
}
