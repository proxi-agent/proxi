import { existsSync, readFileSync } from 'node:fs'
import { inspect } from 'node:util'

import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { Injectable } from '@nestjs/common'
import type { PoolClient, QueryResult, QueryResultRow } from 'pg'
import { Pool } from 'pg'

export type Queryable = {
  query: <T extends QueryResultRow>(text: string, values?: unknown[]) => Promise<QueryResult<T>>
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly pool: Pool

  constructor() {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set. Set it to your RDS connection string before starting the API.')
    }
    const sslCaPath = process.env.DB_SSL_CA_PATH
    const isAwsRds = connectionString.includes('rds.amazonaws.com')
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

    this.pool = new Pool({ connectionString, ssl })
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

  async tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await fn(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }

  private async ensureSchema() {
    // Core pre-existing transfer-case tables (kept for back-compat with existing flows).
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
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        reason TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb
      );
      ALTER TABLE ledger_events ADD COLUMN IF NOT EXISTS reason TEXT;
      ALTER TABLE ledger_events ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
      CREATE INDEX IF NOT EXISTS idx_ledger_events_security_holder ON ledger_events (security_id, holder_id);
      CREATE INDEX IF NOT EXISTS idx_ledger_events_security_from ON ledger_events (security_id, from_holder_id);
      CREATE INDEX IF NOT EXISTS idx_ledger_events_security_to ON ledger_events (security_id, to_holder_id);
      CREATE INDEX IF NOT EXISTS idx_ledger_events_timestamp ON ledger_events (timestamp DESC);
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
        issuer_id TEXT,
        idempotency_key TEXT UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE transfer_cases ADD COLUMN IF NOT EXISTS intake_method TEXT NOT NULL DEFAULT 'GUIDED_ENTRY';
      ALTER TABLE transfer_cases ADD COLUMN IF NOT EXISTS assigned_reviewer_id TEXT;
      ALTER TABLE transfer_cases ADD COLUMN IF NOT EXISTS ai_confidence NUMERIC(5,4);
      ALTER TABLE transfer_cases ADD COLUMN IF NOT EXISTS ai_summary TEXT;
      ALTER TABLE transfer_cases ADD COLUMN IF NOT EXISTS canonical_transfer_data JSONB NOT NULL DEFAULT '{}'::jsonb;
      ALTER TABLE transfer_cases ADD COLUMN IF NOT EXISTS ledger_event_id INTEGER;
      ALTER TABLE transfer_cases ADD COLUMN IF NOT EXISTS last_ai_job_id INTEGER;
      ALTER TABLE transfer_cases ADD COLUMN IF NOT EXISTS issuer_id TEXT;
      ALTER TABLE transfer_cases ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;
      CREATE INDEX IF NOT EXISTS idx_transfer_cases_status ON transfer_cases (status);
      CREATE INDEX IF NOT EXISTS idx_transfer_cases_lifecycle ON transfer_cases (lifecycle_stage);
      CREATE INDEX IF NOT EXISTS idx_transfer_cases_issuer ON transfer_cases (issuer_id);
      CREATE INDEX IF NOT EXISTS idx_transfer_cases_security ON transfer_cases (security_id);
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
      CREATE INDEX IF NOT EXISTS idx_transfer_case_events_case ON transfer_case_events (case_id, created_at DESC);
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

    // New domain tables: issuers, securities, share classes, shareholders, accounts.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS issuers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        legal_name TEXT NOT NULL,
        cik TEXT,
        jurisdiction TEXT NOT NULL DEFAULT 'US',
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        contact_email TEXT,
        website TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_issuers_status ON issuers (status);
      CREATE INDEX IF NOT EXISTS idx_issuers_name ON issuers (name);
    `)

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS securities (
        id TEXT PRIMARY KEY,
        issuer_id TEXT NOT NULL REFERENCES issuers(id) ON DELETE CASCADE,
        ticker TEXT,
        name TEXT NOT NULL,
        cusip TEXT,
        isin TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        currency TEXT NOT NULL DEFAULT 'USD',
        authorized_shares BIGINT NOT NULL DEFAULT 0,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_securities_issuer ON securities (issuer_id);
      CREATE INDEX IF NOT EXISTS idx_securities_ticker ON securities (ticker);
    `)

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS share_classes (
        id TEXT PRIMARY KEY,
        security_id TEXT NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        par_value_cents INTEGER NOT NULL DEFAULT 0,
        votes_per_share NUMERIC(10,4) NOT NULL DEFAULT 1,
        dividend_eligible BOOLEAN NOT NULL DEFAULT TRUE,
        transfer_restricted BOOLEAN NOT NULL DEFAULT FALSE,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (security_id, code)
      );
    `)

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS shareholders (
        id TEXT PRIMARY KEY,
        issuer_id TEXT NOT NULL REFERENCES issuers(id) ON DELETE CASCADE,
        holder_kind TEXT NOT NULL DEFAULT 'REGISTERED',
        legal_name TEXT NOT NULL,
        classification TEXT NOT NULL DEFAULT 'RETAIL',
        jurisdiction TEXT,
        risk_tier TEXT NOT NULL DEFAULT 'LOW',
        email TEXT,
        phone TEXT,
        tax_id_last4 TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        kyc_status TEXT NOT NULL DEFAULT 'PENDING',
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_shareholders_issuer ON shareholders (issuer_id);
      CREATE INDEX IF NOT EXISTS idx_shareholders_status ON shareholders (status);
      CREATE INDEX IF NOT EXISTS idx_shareholders_legal_name ON shareholders (legal_name);
    `)

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS shareholder_accounts (
        id TEXT PRIMARY KEY,
        shareholder_id TEXT NOT NULL REFERENCES shareholders(id) ON DELETE CASCADE,
        issuer_id TEXT NOT NULL REFERENCES issuers(id) ON DELETE CASCADE,
        account_number TEXT NOT NULL,
        registration_type TEXT NOT NULL DEFAULT 'INDIVIDUAL',
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        primary_email TEXT,
        address JSONB NOT NULL DEFAULT '{}'::jsonb,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (issuer_id, account_number)
      );
      CREATE INDEX IF NOT EXISTS idx_accounts_shareholder ON shareholder_accounts (shareholder_id);
      CREATE INDEX IF NOT EXISTS idx_accounts_issuer ON shareholder_accounts (issuer_id);
    `)

    // Holdings view derived from ledger events.
    await this.pool.query(`
      CREATE OR REPLACE VIEW v_holdings AS
      WITH issuance AS (
        SELECT security_id, holder_id, SUM(quantity)::BIGINT AS qty
        FROM ledger_events
        WHERE type = 'ISSUE' AND holder_id IS NOT NULL
        GROUP BY security_id, holder_id
      ),
      cancellations AS (
        SELECT security_id, holder_id, SUM(quantity)::BIGINT AS qty
        FROM ledger_events
        WHERE type = 'CANCEL' AND holder_id IS NOT NULL
        GROUP BY security_id, holder_id
      ),
      adjustments AS (
        SELECT security_id, holder_id, SUM(quantity)::BIGINT AS qty
        FROM ledger_events
        WHERE type = 'ADJUSTMENT' AND holder_id IS NOT NULL
        GROUP BY security_id, holder_id
      ),
      transfers_in AS (
        SELECT security_id, to_holder_id AS holder_id, SUM(quantity)::BIGINT AS qty
        FROM ledger_events
        WHERE type = 'TRANSFER' AND to_holder_id IS NOT NULL
        GROUP BY security_id, to_holder_id
      ),
      transfers_out AS (
        SELECT security_id, from_holder_id AS holder_id, SUM(quantity)::BIGINT AS qty
        FROM ledger_events
        WHERE type = 'TRANSFER' AND from_holder_id IS NOT NULL
        GROUP BY security_id, from_holder_id
      ),
      all_holders AS (
        SELECT security_id, holder_id FROM issuance
        UNION SELECT security_id, holder_id FROM cancellations
        UNION SELECT security_id, holder_id FROM adjustments
        UNION SELECT security_id, holder_id FROM transfers_in
        UNION SELECT security_id, holder_id FROM transfers_out
      )
      SELECT
        h.security_id,
        h.holder_id,
        COALESCE(i.qty, 0)
          - COALESCE(c.qty, 0)
          + COALESCE(a.qty, 0)
          + COALESCE(ti.qty, 0)
          - COALESCE(tout.qty, 0) AS quantity
      FROM all_holders h
      LEFT JOIN issuance i ON i.security_id = h.security_id AND i.holder_id = h.holder_id
      LEFT JOIN cancellations c ON c.security_id = h.security_id AND c.holder_id = h.holder_id
      LEFT JOIN adjustments a ON a.security_id = h.security_id AND a.holder_id = h.holder_id
      LEFT JOIN transfers_in ti ON ti.security_id = h.security_id AND ti.holder_id = h.holder_id
      LEFT JOIN transfers_out tout ON tout.security_id = h.security_id AND tout.holder_id = h.holder_id;
    `)

    // Audit events (append-only, used for structured event streams/copilots).
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS audit_events (
        id BIGSERIAL PRIMARY KEY,
        occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        actor_id TEXT NOT NULL,
        actor_role TEXT,
        action TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'INFO',
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        issuer_id TEXT,
        ip TEXT,
        user_agent TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb
      );
      CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events (entity_type, entity_id, occurred_at DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_issuer ON audit_events (issuer_id, occurred_at DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_events (action);
      CREATE INDEX IF NOT EXISTS idx_audit_occurred ON audit_events (occurred_at DESC);
    `)

    // Dividend events + entitlements.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS dividend_events (
        id TEXT PRIMARY KEY,
        issuer_id TEXT NOT NULL REFERENCES issuers(id) ON DELETE CASCADE,
        security_id TEXT NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
        share_class_id TEXT REFERENCES share_classes(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'DRAFT',
        kind TEXT NOT NULL DEFAULT 'CASH',
        rate_per_share_cents INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        declaration_date DATE NOT NULL,
        record_date DATE NOT NULL,
        payment_date DATE NOT NULL,
        total_distribution_cents BIGINT NOT NULL DEFAULT 0,
        description TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_dividend_events_issuer ON dividend_events (issuer_id, payment_date DESC);
      CREATE INDEX IF NOT EXISTS idx_dividend_events_status ON dividend_events (status);
    `)

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS dividend_entitlements (
        id TEXT PRIMARY KEY,
        dividend_event_id TEXT NOT NULL REFERENCES dividend_events(id) ON DELETE CASCADE,
        account_id TEXT NOT NULL REFERENCES shareholder_accounts(id) ON DELETE CASCADE,
        shareholder_id TEXT NOT NULL REFERENCES shareholders(id) ON DELETE CASCADE,
        shares_held BIGINT NOT NULL,
        amount_cents BIGINT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        paid_at TIMESTAMPTZ,
        payment_reference TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (dividend_event_id, account_id)
      );
      CREATE INDEX IF NOT EXISTS idx_entitlements_event ON dividend_entitlements (dividend_event_id);
      CREATE INDEX IF NOT EXISTS idx_entitlements_account ON dividend_entitlements (account_id);
      CREATE INDEX IF NOT EXISTS idx_entitlements_status ON dividend_entitlements (status);
    `)

    // Meetings, proposals, ballots, votes.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS meetings (
        id TEXT PRIMARY KEY,
        issuer_id TEXT NOT NULL REFERENCES issuers(id) ON DELETE CASCADE,
        kind TEXT NOT NULL DEFAULT 'ANNUAL',
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'DRAFT',
        scheduled_at TIMESTAMPTZ NOT NULL,
        record_date DATE NOT NULL,
        quorum_pct NUMERIC(5,2) NOT NULL DEFAULT 50,
        location TEXT,
        virtual_url TEXT,
        description TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_meetings_issuer ON meetings (issuer_id, scheduled_at DESC);
      CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings (status);
    `)

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS proposals (
        id TEXT PRIMARY KEY,
        meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
        code TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        kind TEXT NOT NULL DEFAULT 'ORDINARY',
        required_pct NUMERIC(5,2) NOT NULL DEFAULT 50,
        status TEXT NOT NULL DEFAULT 'DRAFT',
        sort_order INTEGER NOT NULL DEFAULT 0,
        board_recommendation TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (meeting_id, code)
      );
    `)

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ballots (
        id TEXT PRIMARY KEY,
        meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
        shareholder_id TEXT NOT NULL REFERENCES shareholders(id) ON DELETE CASCADE,
        account_id TEXT NOT NULL REFERENCES shareholder_accounts(id) ON DELETE CASCADE,
        shares_eligible BIGINT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ISSUED',
        submitted_at TIMESTAMPTZ,
        control_number TEXT NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (meeting_id, account_id)
      );
      CREATE INDEX IF NOT EXISTS idx_ballots_meeting ON ballots (meeting_id);
      CREATE INDEX IF NOT EXISTS idx_ballots_status ON ballots (status);
    `)

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS votes (
        id TEXT PRIMARY KEY,
        ballot_id TEXT NOT NULL REFERENCES ballots(id) ON DELETE CASCADE,
        proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
        choice TEXT NOT NULL,
        shares_cast BIGINT NOT NULL,
        cast_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        UNIQUE (ballot_id, proposal_id)
      );
      CREATE INDEX IF NOT EXISTS idx_votes_proposal ON votes (proposal_id);
    `)

    // Notices / communications.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS notices (
        id TEXT PRIMARY KEY,
        issuer_id TEXT NOT NULL REFERENCES issuers(id) ON DELETE CASCADE,
        kind TEXT NOT NULL DEFAULT 'GENERAL',
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        audience TEXT NOT NULL DEFAULT 'ALL',
        status TEXT NOT NULL DEFAULT 'DRAFT',
        related_entity_type TEXT,
        related_entity_id TEXT,
        published_at TIMESTAMPTZ,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_notices_issuer ON notices (issuer_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_notices_status ON notices (status);
    `)

    // Tasks / operational exceptions.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        issuer_id TEXT REFERENCES issuers(id) ON DELETE SET NULL,
        type TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'SYSTEM',
        priority TEXT NOT NULL DEFAULT 'MEDIUM',
        severity TEXT NOT NULL DEFAULT 'INFO',
        status TEXT NOT NULL DEFAULT 'OPEN',
        title TEXT NOT NULL,
        description TEXT,
        assignee_id TEXT,
        related_entity_type TEXT,
        related_entity_id TEXT,
        due_at TIMESTAMPTZ,
        resolved_at TIMESTAMPTZ,
        resolved_by TEXT,
        recommended_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);
      CREATE INDEX IF NOT EXISTS idx_tasks_issuer ON tasks (issuer_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks (priority);
      CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks (assignee_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_related ON tasks (related_entity_type, related_entity_id);
    `)
  }
}
