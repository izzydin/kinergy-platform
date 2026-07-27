import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { AsyncLocalStorage } from 'async_hooks';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly asyncLocalStorage = new AsyncLocalStorage<Prisma.TransactionClient>();

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Returns the current active Prisma transaction client if executing within
   * an IUnitOfWork transaction context; otherwise returns the main PrismaClient.
   */
  getClient(): Prisma.TransactionClient | PrismaClient {
    return this.asyncLocalStorage.getStore() ?? this;
  }

  /**
   * Runs an asynchronous callback inside a Prisma database transaction context.
   */
  async runInTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      return this.asyncLocalStorage.run(tx, () => fn(tx));
    });
  }
}
