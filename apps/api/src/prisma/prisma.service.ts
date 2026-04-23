import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { Injectable, Logger } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

/**
 * Thin NestJS wrapper around PrismaClient. Owns the connection lifecycle so
 * that shutdowns flush in-flight transactions cleanly. Use `$transaction`
 * on this service for any write that must be atomic (e.g. transfer
 * settlement).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name)

  async onModuleInit() {
    try {
      await this.$connect()
    } catch (error) {
      this.logger.error('Prisma failed to connect. Check DATABASE_URL and that migrations have been applied.', error)
      throw error
    }
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}
