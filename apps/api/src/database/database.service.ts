import { existsSync, readFileSync } from 'node:fs'
import { inspect } from 'node:util'

import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { Injectable } from '@nestjs/common'
import type { QueryResult, QueryResultRow } from 'pg'
import { Pool } from 'pg'

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly pool: Pool

  constructor() {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set. Set it to your RDS connection string before starting the API.')
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
        case_id INTEGER,
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
        intake_method TEXT NOT NULL DEFAULT 'GUIDED_ENTRY',
        assigned_reviewer_id TEXT,
        ai_confidence NUMERIC(5,4),
        ai_summary TEXT,
        canonical_transfer_data JSONB NOT NULL DEFAULT '{}'::jsonb,
        ledger_event_id INTEGER,
        last_ai_job_id INTEGER,
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

    await this.pool.query(`
      ALTER TABLE ledger_events ADD COLUMN IF NOT EXISTS case_id INTEGER;
      ALTER TABLE transfer_cases ADD COLUMN IF NOT EXISTS intake_method TEXT NOT NULL DEFAULT 'GUIDED_ENTRY';
      ALTER TABLE transfer_cases ADD COLUMN IF NOT EXISTS assigned_reviewer_id TEXT;
      ALTER TABLE transfer_cases ADD COLUMN IF NOT EXISTS ai_confidence NUMERIC(5,4);
      ALTER TABLE transfer_cases ADD COLUMN IF NOT EXISTS ai_summary TEXT;
      ALTER TABLE transfer_cases ADD COLUMN IF NOT EXISTS canonical_transfer_data JSONB NOT NULL DEFAULT '{}'::jsonb;
      ALTER TABLE transfer_cases ADD COLUMN IF NOT EXISTS ledger_event_id INTEGER;
      ALTER TABLE transfer_cases ADD COLUMN IF NOT EXISTS last_ai_job_id INTEGER;
    `)

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS transfer_case_events (
        id SERIAL PRIMARY KEY,
        case_id INTEGER NOT NULL REFERENCES transfer_cases(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        actor TEXT NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `)

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS transfer_documents (
        id SERIAL PRIMARY KEY,
        case_id INTEGER NOT NULL REFERENCES transfer_cases(id) ON DELETE CASCADE,
        doc_type TEXT NOT NULL,
        file_name TEXT NOT NULL,
        content_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL DEFAULT 0,
        storage_key TEXT NOT NULL,
        storage_bucket TEXT,
        upload_status TEXT NOT NULL DEFAULT 'REGISTERED',
        checksum_sha256 TEXT,
        uploaded_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `)

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS transfer_extractions (
        id SERIAL PRIMARY KEY,
        case_id INTEGER NOT NULL REFERENCES transfer_cases(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        prompt_version TEXT NOT NULL,
        confidence NUMERIC(5,4) NOT NULL DEFAULT 0,
        completeness_score NUMERIC(5,4) NOT NULL DEFAULT 0,
        extraction_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        issues TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
        raw_text TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `)

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS transfer_approvals (
        id SERIAL PRIMARY KEY,
        case_id INTEGER NOT NULL REFERENCES transfer_cases(id) ON DELETE CASCADE,
        action TEXT NOT NULL,
        actor TEXT NOT NULL,
        reason TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `)

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS transfer_jobs (
        id SERIAL PRIMARY KEY,
        case_id INTEGER NOT NULL REFERENCES transfer_cases(id) ON DELETE CASCADE,
        job_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'QUEUED',
        queue_message_id TEXT,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `)
  }
}
