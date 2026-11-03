import { StorageProviderType } from '../domain/storage.types';

export interface StorageConfiguration {
  provider: StorageProviderType;
  localRoot: string;
  s3Endpoint?: string;
  s3Region: string;
  s3Bucket: string;
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
  s3ForcePathStyle: boolean;
  maxFileSizeBytes: number;
  signedUrlExpirationSeconds: number;
  tenantQuotaBytes: number;
  allowedMimeTypes: string[];
}

export const DEFAULT_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];

export const DEFAULT_STORAGE_CONFIG: StorageConfiguration = {
  provider: 'local',
  localRoot: './.storage',
  s3Region: 'auto',
  s3Bucket: 'kinergy-staging-media',
  s3ForcePathStyle: false,
  maxFileSizeBytes: 10 * 1024 * 1024, // 10 MB
  signedUrlExpirationSeconds: 15 * 60, // 15 Minutes
  tenantQuotaBytes: 5 * 1024 * 1024 * 1024, // 5 GB default quota per tenant
  allowedMimeTypes: DEFAULT_ALLOWED_MIME_TYPES,
};
