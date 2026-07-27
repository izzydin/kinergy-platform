import { Injectable } from '@nestjs/common';
import { IUnitOfWork } from '../unit-of-work.interface';
import { PrismaService } from './prisma.service';

/**
 * Infrastructure implementation of IUnitOfWork interface using Prisma Client's $transaction.
 * Preserves Clean Architecture by keeping database transaction mechanisms isolated to infrastructure.
 */
@Injectable()
export class PrismaUnitOfWork implements IUnitOfWork {
  constructor(private readonly prisma: PrismaService) {}

  async executeInTransaction<T>(work: () => Promise<T>): Promise<T> {
    return this.prisma.runInTransaction(async () => {
      return work();
    });
  }
}
