import { Global, Module } from '@nestjs/common';
import { UNIT_OF_WORK } from '../unit-of-work.interface';
import { PrismaUnitOfWork } from './prisma-unit-of-work';
import { PrismaService } from './prisma.service';

import { PrismaClient } from '@prisma/client';

@Global()
@Module({
  providers: [
    PrismaService,
    PrismaUnitOfWork,
    {
      provide: PrismaClient,
      useExisting: PrismaService,
    },
    {
      provide: UNIT_OF_WORK,
      useClass: PrismaUnitOfWork,
    },
  ],
  exports: [PrismaService, PrismaClient, PrismaUnitOfWork, UNIT_OF_WORK],
})
export class PrismaModule {}
