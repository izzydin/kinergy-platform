import * as crypto from 'crypto';
import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import type { Response } from 'express';
import { MediaStorageService } from '../services/media-storage.service';
import { StorageFileNotFoundError, StorageTenantAccessDeniedError } from '../domain/storage.errors';

@Controller('api/v1/storage')
export class StorageController {
  constructor(private readonly mediaStorageService: MediaStorageService) {}

  /**
   * Local mode download endpoint.
   * Serves file contents directly when running with LocalStorageAdapter,
   * enforcing cryptographic HMAC signature validation, expiration checking,
   * and tenant ownership assertions.
   */
  @Get('local/:key(*)')
  async serveLocalFile(
    @Param('key') key: string,
    @Query('token') token: string,
    @Res() res: Response,
    @Query('expiresAt') expiresAt?: string,
  ): Promise<void> {
    if (!token) {
      throw new ForbiddenException('Missing download authorization token');
    }

    // Key format: tenants/{tenantId}/...
    const parts = key.split('/');
    const tenantId = parts[1];

    if (!tenantId) {
      throw new ForbiddenException('Invalid tenant object path');
    }

    // Cryptographic validation of signed token and expiration
    const exp = Number(expiresAt);
    if (!expiresAt || isNaN(exp)) {
      throw new ForbiddenException('Missing or invalid token expiration parameter');
    }

    const currentEpoch = Math.floor(Date.now() / 1000);
    if (currentEpoch > exp) {
      throw new ForbiddenException('Download authorization token has expired');
    }

    const secret =
      process.env['STORAGE_LOCAL_SECRET'] ||
      process.env['JWT_SECRET'] ||
      'local-storage-secret-key-salt-2026';
    const expectedToken = crypto
      .createHmac('sha256', secret)
      .update(`${tenantId}:${key}:${exp}`)
      .digest('hex');

    const tokenBuffer = Buffer.from(token);
    const expectedBuffer = Buffer.from(expectedToken);

    if (
      tokenBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(tokenBuffer, expectedBuffer)
    ) {
      throw new ForbiddenException('Invalid download authorization token signature');
    }

    try {
      const { data, metadata } = await this.mediaStorageService.getFile(tenantId, key);

      res.setHeader('Content-Type', metadata.mimeType);
      res.setHeader('Content-Length', metadata.sizeBytes);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(metadata.filename)}"`,
      );

      res.send(data);
    } catch (err: unknown) {
      if (err instanceof StorageFileNotFoundError) {
        throw new NotFoundException(err.message);
      }
      if (err instanceof StorageTenantAccessDeniedError) {
        throw new ForbiddenException(err.message);
      }
      throw err;
    }
  }
}
