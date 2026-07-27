import { UserStatus } from '../../domain/user-status.enum';

export interface UserProfileDto {
  id: string;
  email: string;
  status: UserStatus;
  roles: string[];
  permissions: string[];
  tenantId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthenticationResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: UserProfileDto;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface LogoutDto {
  userId?: string;
  refreshToken?: string;
}

export interface RefreshTokenDto {
  refreshToken: string;
}

export interface GetCurrentUserDto {
  userId?: string;
}
