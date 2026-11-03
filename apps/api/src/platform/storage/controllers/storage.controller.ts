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
   * Serves file contents directly when running with LocalStorageAdapter.
   */
  @Get('local/:key(*)')
  async serveLocalFile(
    @Param('key') key: string,
    @Query('token') token: string,
    @Res() res: Response,
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
