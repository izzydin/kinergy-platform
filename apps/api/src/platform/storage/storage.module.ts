import { DynamicModule, Module, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OBJECT_STORAGE_PORT } from './ports/object-storage.port';
import { LocalStorageAdapter } from './adapters/local-storage.adapter';
import { S3StorageAdapter } from './adapters/s3-storage.adapter';
import { MediaStorageService } from './services/media-storage.service';
import { StorageController } from './controllers/storage.controller';
import { DEFAULT_STORAGE_CONFIG, StorageConfiguration } from './config/storage.config';

@Module({})
export class StorageModule {
  static register(customConfig?: Partial<StorageConfiguration>): DynamicModule {
    const configProvider: Provider = {
      provide: 'STORAGE_CONFIGURATION',
      useFactory: (configService: ConfigService): StorageConfiguration => {
        const provider = (configService.get<string>('STORAGE_PROVIDER', 'local') || 'local') as
          'local' | 's3';

        return {
          ...DEFAULT_STORAGE_CONFIG,
          provider,
          localRoot: configService.get<string>('STORAGE_LOCAL_ROOT', './.storage'),
          s3Endpoint: configService.get<string>('STORAGE_S3_ENDPOINT'),
          s3Region: configService.get<string>('STORAGE_S3_REGION', 'auto'),
          s3Bucket: configService.get<string>('STORAGE_S3_BUCKET', 'kinergy-staging-media'),
          s3AccessKeyId: configService.get<string>('STORAGE_S3_ACCESS_KEY_ID'),
          s3SecretAccessKey: configService.get<string>('STORAGE_S3_SECRET_ACCESS_KEY'),
          s3ForcePathStyle:
            configService.get<string>('STORAGE_S3_FORCE_PATH_STYLE', 'false') === 'true',
          maxFileSizeBytes: Number(
            configService.get<number>('STORAGE_MAX_FILE_SIZE_BYTES', 10 * 1024 * 1024),
          ),
          signedUrlExpirationSeconds: Number(
            configService.get<number>('STORAGE_SIGNED_URL_EXPIRATION_SECONDS', 900),
          ),
          tenantQuotaBytes: Number(
            configService.get<number>('STORAGE_TENANT_QUOTA_BYTES', 5 * 1024 * 1024 * 1024),
          ),
          ...customConfig,
        };
      },
      inject: [ConfigService],
    };

    const storagePortProvider: Provider = {
      provide: OBJECT_STORAGE_PORT,
      useFactory: (config: StorageConfiguration) => {
        if (config.provider === 's3') {
          return new S3StorageAdapter(config);
        }
        return new LocalStorageAdapter(config);
      },
      inject: ['STORAGE_CONFIGURATION'],
    };

    return {
      module: StorageModule,
      controllers: [StorageController],
      providers: [configProvider, storagePortProvider, MediaStorageService],
      exports: [OBJECT_STORAGE_PORT, MediaStorageService, 'STORAGE_CONFIGURATION'],
    };
  }
}
