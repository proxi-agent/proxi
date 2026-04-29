import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { Injectable, Logger } from '@nestjs/common'
import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '../generated/prisma/client.js'

/**
 * Thin NestJS wrapper around PrismaClient. Owns the connection lifecycle so
 * that shutdowns flush in-flight transactions cleanly. Use `$transaction`
 * on this service for any write that must be atomic (e.g. transfer
 * settlement).
 *
 * Prisma 7 requires a driver adapter — we use `@prisma/adapter-pg` against
 * `DATABASE_URL`. SSL behavior is preserved from v6 by setting
 * `rejectUnauthorized: false` only when `DATABASE_SSL_REJECT_UNAUTHORIZED`
 * is explicitly opted out.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name)

  constructor() {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set; PrismaService cannot start.')
    }

    const sslOptOut = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'false'
    const adapter = new PrismaPg({
      connectionString,
      ...(sslOptOut ? { ssl: { rejectUnauthorized: false } } : {}),
    })

    super({ adapter })
  }

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
