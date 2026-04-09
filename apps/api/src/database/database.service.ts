import { Injectable } from '@nestjs/common'
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import type { QueryResult, QueryResultRow } from 'pg'
import { Pool } from 'pg'
import { existsSync, readFileSync } from 'node:fs'
import { inspect } from 'node:util'

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly pool: Pool

  constructor() {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error(
        'DATABASE_URL is not set. Set it to your RDS connection string before starting the API.',
      )
    }
    const sslCaPath = process.env.DB_SSL_CA_PATH
    const isAwsRds = connectionString?.includes('rds.amazonaws.com')
    const sslMode = process.env.DB_SSL_MODE || (isAwsRds ? 'require' : 'disable')

    let ssl: { ca?: string; rejectUnauthorized: boolean } | undefined
    if (sslMode !== 'disable') {
      if (sslCaPath) {
        if (!existsSync(sslCaPath)) {
          throw new Error(`DB_SSL_CA_PATH is set but file does not exist: ${sslCaPath}`)
        }
        ssl = {
          ca: readFileSync(sslCaPath, 'utf8'),
          rejectUnauthorized: sslMode === 'verify-full',
        }
      } else {
        ssl = { rejectUnauthorized: false }
      }
    }

    this.pool = new Pool({
      connectionString,
      ssl,
    })
  }

  async onModuleInit() {
    try {
      await this.ensureSchema()
    } catch (error) {
      const message = error instanceof Error ? error.message || inspect(error) : String(error)
      throw new Error(
        [
          'Database initialization failed.',
          `Original error: ${message}`,
          'Set DATABASE_URL to your RDS endpoint and ensure network/security groups allow connections on 5432.',
          'If using RDS cert verification, set DB_SSL_MODE=verify-full and DB_SSL_CA_PATH to your global-bundle.pem path.',
        ].join(' '),
      )
    }
  }

  async onModuleDestroy() {
    await this.pool.end()
  }

  async query<T extends QueryResultRow>(text: string, values: unknown[] = []): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, values)
  }

  private async ensureSchema() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ledger_events (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        security_id TEXT NOT NULL,
        from_holder_id TEXT,
        to_holder_id TEXT,
        holder_id TEXT,
        quantity INTEGER NOT NULL,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `)

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS transfer_cases (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        security_id TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        from_holder_id TEXT,
        to_holder_id TEXT,
        holder_id TEXT,
        status TEXT NOT NULL,
        lifecycle_stage TEXT NOT NULL,
        evidence_required TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
        evidence_submitted TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
        missing_evidence TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
        restriction_blocking_reasons TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
        restriction_checks JSONB NOT NULL DEFAULT '[]'::jsonb,
        restriction_context JSONB NOT NULL DEFAULT '{}'::jsonb,
        failure_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `)
  }
}
