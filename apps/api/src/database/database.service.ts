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
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        external_id TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        full_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        platform_role TEXT NOT NULL DEFAULT 'NONE',
        last_seen_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);
      CREATE INDEX IF NOT EXISTS idx_users_external_id ON users (external_id);
    `)

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS user_issuer_roles (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        issuer_id TEXT NOT NULL REFERENCES issuers(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, issuer_id)
      );
      CREATE INDEX IF NOT EXISTS idx_user_issuer_roles_issuer ON user_issuer_roles (issuer_id, role);
      CREATE INDEX IF NOT EXISTS idx_user_issuer_roles_user ON user_issuer_roles (user_id, role);
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
        actor_id TEXT,
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
      ALTER TABLE audit_events ALTER COLUMN actor_id DROP NOT NULL;
    `)

    // Dividend events + entitlements.
    //
    // The dividend module has a richer surface than the original MVP: full
    // declaration metadata, an explicit eligibility snapshot, batched
    // payments, tax withholding, statements, and DRIP instructions. The
    // tables below evolve the original `dividend_events` / `dividend_entitlements`
    // schema with `ALTER TABLE … ADD COLUMN IF NOT EXISTS` so existing rows
    // (and the seed/demo flow) continue to work after the upgrade.
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
      ALTER TABLE dividend_events ADD COLUMN IF NOT EXISTS ex_dividend_date DATE;
      ALTER TABLE dividend_events ADD COLUMN IF NOT EXISTS rate_type TEXT NOT NULL DEFAULT 'PER_SHARE';
      ALTER TABLE dividend_events ADD COLUMN IF NOT EXISTS rate_amount NUMERIC(28,8) NOT NULL DEFAULT 0;
      ALTER TABLE dividend_events ADD COLUMN IF NOT EXISTS notes TEXT;
      ALTER TABLE dividend_events ADD COLUMN IF NOT EXISTS withholding_default_pct NUMERIC(7,4) NOT NULL DEFAULT 0;
      ALTER TABLE dividend_events ADD COLUMN IF NOT EXISTS supporting_documents JSONB NOT NULL DEFAULT '[]'::jsonb;
      ALTER TABLE dividend_events ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
      ALTER TABLE dividend_events ADD COLUMN IF NOT EXISTS eligibility_locked_at TIMESTAMPTZ;
      ALTER TABLE dividend_events ADD COLUMN IF NOT EXISTS calculated_at TIMESTAMPTZ;
      ALTER TABLE dividend_events ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
      ALTER TABLE dividend_events ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
      ALTER TABLE dividend_events ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
      ALTER TABLE dividend_events ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;
      ALTER TABLE dividend_events ADD COLUMN IF NOT EXISTS changes_requested_at TIMESTAMPTZ;
      ALTER TABLE dividend_events ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE dividend_events ADD COLUMN IF NOT EXISTS calculation_version INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE dividend_events ADD COLUMN IF NOT EXISTS calculations_locked_at TIMESTAMPTZ;
      ALTER TABLE dividend_events ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
      CREATE INDEX IF NOT EXISTS idx_dividend_events_issuer ON dividend_events (issuer_id, payment_date DESC);
      CREATE INDEX IF NOT EXISTS idx_dividend_events_status ON dividend_events (status);
      CREATE INDEX IF NOT EXISTS idx_dividend_events_security ON dividend_events (security_id, payment_date DESC);
      CREATE INDEX IF NOT EXISTS idx_dividend_events_record_date ON dividend_events (record_date);
      CREATE INDEX IF NOT EXISTS idx_dividend_events_payment_date ON dividend_events (payment_date);
    `)

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS dividend_eligibility_snapshots (
        id TEXT PRIMARY KEY,
        dividend_event_id TEXT NOT NULL REFERENCES dividend_events(id) ON DELETE CASCADE,
        issuer_id TEXT NOT NULL REFERENCES issuers(id) ON DELETE CASCADE,
        security_id TEXT NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
        share_class_id TEXT REFERENCES share_classes(id) ON DELETE SET NULL,
        record_date DATE NOT NULL,
        captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        locked_at TIMESTAMPTZ,
        holder_count INTEGER NOT NULL DEFAULT 0,
        total_eligible_shares NUMERIC(38,8) NOT NULL DEFAULT 0,
        snapshot_payload JSONB NOT NULL DEFAULT '[]'::jsonb,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        UNIQUE (dividend_event_id)
      );
      ALTER TABLE dividend_eligibility_snapshots ADD COLUMN IF NOT EXISTS excluded_holder_count INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX IF NOT EXISTS idx_div_snapshots_issuer ON dividend_eligibility_snapshots (issuer_id, record_date DESC);
      CREATE INDEX IF NOT EXISTS idx_div_snapshots_security ON dividend_eligibility_snapshots (security_id, record_date DESC);
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
      ALTER TABLE dividend_entitlements ADD COLUMN IF NOT EXISTS eligibility_snapshot_id TEXT REFERENCES dividend_eligibility_snapshots(id) ON DELETE SET NULL;
      ALTER TABLE dividend_entitlements ADD COLUMN IF NOT EXISTS shares_held_decimal NUMERIC(38,8) NOT NULL DEFAULT 0;
      ALTER TABLE dividend_entitlements ADD COLUMN IF NOT EXISTS gross_amount_cents BIGINT NOT NULL DEFAULT 0;
      ALTER TABLE dividend_entitlements ADD COLUMN IF NOT EXISTS withholding_cents BIGINT NOT NULL DEFAULT 0;
      ALTER TABLE dividend_entitlements ADD COLUMN IF NOT EXISTS net_amount_cents BIGINT NOT NULL DEFAULT 0;
      ALTER TABLE dividend_entitlements ADD COLUMN IF NOT EXISTS withholding_pct NUMERIC(7,4) NOT NULL DEFAULT 0;
      ALTER TABLE dividend_entitlements ADD COLUMN IF NOT EXISTS payment_method TEXT;
      ALTER TABLE dividend_entitlements ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ;
      ALTER TABLE dividend_entitlements ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD';
      ALTER TABLE dividend_entitlements ADD COLUMN IF NOT EXISTS tax_status TEXT NOT NULL DEFAULT 'RESIDENT';
      ALTER TABLE dividend_entitlements ADD COLUMN IF NOT EXISTS tax_residency TEXT;
      ALTER TABLE dividend_entitlements ADD COLUMN IF NOT EXISTS tax_form_status TEXT;
      ALTER TABLE dividend_entitlements ADD COLUMN IF NOT EXISTS treaty_rate NUMERIC(7,4);
      ALTER TABLE dividend_entitlements ADD COLUMN IF NOT EXISTS withholding_reason TEXT;
      ALTER TABLE dividend_entitlements ADD COLUMN IF NOT EXISTS calculation_version INTEGER NOT NULL DEFAULT 1;
      CREATE INDEX IF NOT EXISTS idx_entitlements_event ON dividend_entitlements (dividend_event_id);
      CREATE INDEX IF NOT EXISTS idx_entitlements_account ON dividend_entitlements (account_id);
      CREATE INDEX IF NOT EXISTS idx_entitlements_shareholder ON dividend_entitlements (shareholder_id);
      CREATE INDEX IF NOT EXISTS idx_entitlements_status ON dividend_entitlements (status);
      CREATE INDEX IF NOT EXISTS idx_entitlements_event_status ON dividend_entitlements (dividend_event_id, status);
    `)

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS dividend_approvals (
        id TEXT PRIMARY KEY,
        dividend_event_id TEXT NOT NULL REFERENCES dividend_events(id) ON DELETE CASCADE,
        action TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        actor_role TEXT,
        decision_notes TEXT,
        decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_div_approvals_event ON dividend_approvals (dividend_event_id, decided_at DESC);
      CREATE INDEX IF NOT EXISTS idx_div_approvals_actor ON dividend_approvals (actor_id);
    `)

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS dividend_payment_batches (
        id TEXT PRIMARY KEY,
        dividend_event_id TEXT NOT NULL REFERENCES dividend_events(id) ON DELETE CASCADE,
        issuer_id TEXT NOT NULL REFERENCES issuers(id) ON DELETE CASCADE,
        method TEXT NOT NULL DEFAULT 'ACH',
        status TEXT NOT NULL DEFAULT 'DRAFT',
        scheduled_at TIMESTAMPTZ,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        cancelled_at TIMESTAMPTZ,
        payment_count INTEGER NOT NULL DEFAULT 0,
        total_gross_cents BIGINT NOT NULL DEFAULT 0,
        total_withholding_cents BIGINT NOT NULL DEFAULT 0,
        total_net_cents BIGINT NOT NULL DEFAULT 0,
        notes TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE dividend_payment_batches ADD COLUMN IF NOT EXISTS batch_number TEXT;
      ALTER TABLE dividend_payment_batches ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD';
      ALTER TABLE dividend_payment_batches ADD COLUMN IF NOT EXISTS payment_date DATE;
      ALTER TABLE dividend_payment_batches ADD COLUMN IF NOT EXISTS created_by TEXT;
      ALTER TABLE dividend_payment_batches ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
      ALTER TABLE dividend_payment_batches ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ;
      CREATE INDEX IF NOT EXISTS idx_div_batches_event ON dividend_payment_batches (dividend_event_id);
      CREATE INDEX IF NOT EXISTS idx_div_batches_issuer ON dividend_payment_batches (issuer_id, scheduled_at DESC);
      CREATE INDEX IF NOT EXISTS idx_div_batches_status ON dividend_payment_batches (status);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_div_batches_event_number
        ON dividend_payment_batches (dividend_event_id, batch_number)
        WHERE batch_number IS NOT NULL;
    `)

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS dividend_payments (
        id TEXT PRIMARY KEY,
        dividend_event_id TEXT NOT NULL REFERENCES dividend_events(id) ON DELETE CASCADE,
        batch_id TEXT REFERENCES dividend_payment_batches(id) ON DELETE SET NULL,
        entitlement_id TEXT NOT NULL REFERENCES dividend_entitlements(id) ON DELETE CASCADE,
        account_id TEXT NOT NULL REFERENCES shareholder_accounts(id) ON DELETE RESTRICT,
        shareholder_id TEXT NOT NULL REFERENCES shareholders(id) ON DELETE RESTRICT,
        gross_amount_cents BIGINT NOT NULL,
        withholding_cents BIGINT NOT NULL DEFAULT 0,
        net_amount_cents BIGINT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        method TEXT NOT NULL DEFAULT 'ACH',
        status TEXT NOT NULL DEFAULT 'PENDING',
        external_ref TEXT,
        failure_reason TEXT,
        attempt_no INTEGER NOT NULL DEFAULT 1,
        paid_at TIMESTAMPTZ,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE dividend_payments ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
      ALTER TABLE dividend_payments ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ;
      ALTER TABLE dividend_payments ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ;
      CREATE INDEX IF NOT EXISTS idx_div_payments_event ON dividend_payments (dividend_event_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_div_payments_batch ON dividend_payments (batch_id);
      CREATE INDEX IF NOT EXISTS idx_div_payments_entitlement ON dividend_payments (entitlement_id);
      CREATE INDEX IF NOT EXISTS idx_div_payments_account ON dividend_payments (account_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_div_payments_shareholder ON dividend_payments (shareholder_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_div_payments_status ON dividend_payments (status);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_div_payments_idempotency
        ON dividend_payments (idempotency_key)
        WHERE idempotency_key IS NOT NULL;
    `)

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS dividend_tax_withholdings (
        id TEXT PRIMARY KEY,
        dividend_event_id TEXT NOT NULL REFERENCES dividend_events(id) ON DELETE CASCADE,
        entitlement_id TEXT NOT NULL REFERENCES dividend_entitlements(id) ON DELETE CASCADE,
        payment_id TEXT REFERENCES dividend_payments(id) ON DELETE SET NULL,
        shareholder_id TEXT NOT NULL REFERENCES shareholders(id) ON DELETE RESTRICT,
        jurisdiction TEXT NOT NULL DEFAULT 'US',
        withholding_pct NUMERIC(7,4) NOT NULL,
        taxable_amount_cents BIGINT NOT NULL,
        withholding_cents BIGINT NOT NULL,
        reason TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_div_withholding_event ON dividend_tax_withholdings (dividend_event_id);
      CREATE INDEX IF NOT EXISTS idx_div_withholding_entitlement ON dividend_tax_withholdings (entitlement_id);
      CREATE INDEX IF NOT EXISTS idx_div_withholding_shareholder ON dividend_tax_withholdings (shareholder_id);
    `)

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS dividend_statements (
        id TEXT PRIMARY KEY,
        dividend_event_id TEXT NOT NULL REFERENCES dividend_events(id) ON DELETE CASCADE,
        entitlement_id TEXT NOT NULL REFERENCES dividend_entitlements(id) ON DELETE CASCADE,
        shareholder_id TEXT NOT NULL REFERENCES shareholders(id) ON DELETE RESTRICT,
        account_id TEXT NOT NULL REFERENCES shareholder_accounts(id) ON DELETE RESTRICT,
        gross_amount_cents BIGINT NOT NULL,
        withholding_cents BIGINT NOT NULL DEFAULT 0,
        net_amount_cents BIGINT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        statement_date DATE NOT NULL,
        status TEXT NOT NULL DEFAULT 'DRAFT',
        document_storage_key TEXT,
        sent_at TIMESTAMPTZ,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (dividend_event_id, entitlement_id)
      );
      CREATE INDEX IF NOT EXISTS idx_div_statements_event ON dividend_statements (dividend_event_id);
      CREATE INDEX IF NOT EXISTS idx_div_statements_shareholder ON dividend_statements (shareholder_id, statement_date DESC);
      CREATE INDEX IF NOT EXISTS idx_div_statements_status ON dividend_statements (status);
    `)

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS dividend_reinvestment_instructions (
        id TEXT PRIMARY KEY,
        issuer_id TEXT NOT NULL REFERENCES issuers(id) ON DELETE CASCADE,
        shareholder_id TEXT NOT NULL REFERENCES shareholders(id) ON DELETE CASCADE,
        account_id TEXT NOT NULL REFERENCES shareholder_accounts(id) ON DELETE CASCADE,
        security_id TEXT NOT NULL REFERENCES securities(id) ON DELETE CASCADE,
        share_class_id TEXT REFERENCES share_classes(id) ON DELETE SET NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        percentage NUMERIC(5,2) NOT NULL DEFAULT 100,
        effective_from DATE NOT NULL,
        effective_to DATE,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (account_id, security_id, share_class_id, effective_from)
      );
      CREATE INDEX IF NOT EXISTS idx_drip_issuer ON dividend_reinvestment_instructions (issuer_id);
      CREATE INDEX IF NOT EXISTS idx_drip_shareholder ON dividend_reinvestment_instructions (shareholder_id);
      CREATE INDEX IF NOT EXISTS idx_drip_security ON dividend_reinvestment_instructions (security_id);
    `)

    // Board-driven shareholder notices and market announcements.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS dividend_communications (
        id TEXT PRIMARY KEY,
        dividend_event_id TEXT NOT NULL REFERENCES dividend_events(id) ON DELETE CASCADE,
        issuer_id TEXT NOT NULL REFERENCES issuers(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'DRAFT',
        subject TEXT,
        body TEXT,
        audience TEXT,
        channel TEXT,
        scheduled_at TIMESTAMPTZ,
        sent_at TIMESTAMPTZ,
        approved_at TIMESTAMPTZ,
        cancelled_at TIMESTAMPTZ,
        document_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_div_comms_event ON dividend_communications (dividend_event_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_div_comms_status ON dividend_communications (status);
    `)

    // Fractional-share adjustments captured per entitlement so the
    // audit trail explains why a holder received their final amount.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS dividend_fractional_adjustments (
        id TEXT PRIMARY KEY,
        dividend_event_id TEXT NOT NULL REFERENCES dividend_events(id) ON DELETE CASCADE,
        entitlement_id TEXT NOT NULL REFERENCES dividend_entitlements(id) ON DELETE CASCADE,
        shareholder_id TEXT NOT NULL REFERENCES shareholders(id) ON DELETE RESTRICT,
        policy TEXT NOT NULL,
        fractional_shares NUMERIC(38,8) NOT NULL DEFAULT 0,
        whole_shares_issued INTEGER NOT NULL DEFAULT 0,
        adjustment_cents BIGINT NOT NULL DEFAULT 0,
        reason TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_div_frac_event ON dividend_fractional_adjustments (dividend_event_id);
      CREATE INDEX IF NOT EXISTS idx_div_frac_entitlement ON dividend_fractional_adjustments (entitlement_id);
    `)

    // DRIP execution records — distinct from the long-lived
    // `dividend_reinvestment_instructions`, which captures the
    // shareholder's standing election.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS dividend_reinvestment_records (
        id TEXT PRIMARY KEY,
        dividend_event_id TEXT NOT NULL REFERENCES dividend_events(id) ON DELETE CASCADE,
        entitlement_id TEXT NOT NULL REFERENCES dividend_entitlements(id) ON DELETE CASCADE,
        shareholder_id TEXT NOT NULL REFERENCES shareholders(id) ON DELETE RESTRICT,
        account_id TEXT NOT NULL REFERENCES shareholder_accounts(id) ON DELETE RESTRICT,
        status TEXT NOT NULL DEFAULT 'CALCULATED',
        reinvested_amount_cents BIGINT NOT NULL DEFAULT 0,
        purchase_price NUMERIC(28,8) NOT NULL DEFAULT 0,
        shares_issued NUMERIC(38,8) NOT NULL DEFAULT 0,
        fractional_share_handling TEXT NOT NULL DEFAULT 'CASH_IN_LIEU',
        residual_cash_cents BIGINT NOT NULL DEFAULT 0,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (dividend_event_id, entitlement_id)
      );
      CREATE INDEX IF NOT EXISTS idx_div_drip_records_event ON dividend_reinvestment_records (dividend_event_id);
      CREATE INDEX IF NOT EXISTS idx_div_drip_records_shareholder ON dividend_reinvestment_records (shareholder_id);
    `)

    // Typed reconciliation exceptions, with a status loop for the
    // resolve / waive / re-investigate workflow.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS dividend_reconciliation_exceptions (
        id TEXT PRIMARY KEY,
        dividend_event_id TEXT NOT NULL REFERENCES dividend_events(id) ON DELETE CASCADE,
        batch_id TEXT REFERENCES dividend_payment_batches(id) ON DELETE SET NULL,
        payment_id TEXT REFERENCES dividend_payments(id) ON DELETE SET NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'OPEN',
        description TEXT NOT NULL,
        expected_cents BIGINT,
        observed_cents BIGINT,
        resolution TEXT,
        opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at TIMESTAMPTZ,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb
      );
      CREATE INDEX IF NOT EXISTS idx_div_exceptions_event ON dividend_reconciliation_exceptions (dividend_event_id, opened_at DESC);
      CREATE INDEX IF NOT EXISTS idx_div_exceptions_status ON dividend_reconciliation_exceptions (status);
      CREATE INDEX IF NOT EXISTS idx_div_exceptions_payment ON dividend_reconciliation_exceptions (payment_id);
    `)

    // AI-assisted preflight reviews. Stored separately from `audit_events`
    // so we can return the structured output to the UI without
    // materialising a new audit row each time, and so the deterministic
    // findings live alongside the AI prose for forensic review.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS dividend_ai_reviews (
        id TEXT PRIMARY KEY,
        dividend_event_id TEXT NOT NULL REFERENCES dividend_events(id) ON DELETE CASCADE,
        issuer_id TEXT NOT NULL REFERENCES issuers(id) ON DELETE CASCADE,
        requested_by TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL DEFAULT '',
        prompt_version TEXT NOT NULL DEFAULT '',
        dividend_status TEXT NOT NULL,
        preflight JSONB NOT NULL DEFAULT '{}'::jsonb,
        output JSONB NOT NULL DEFAULT '{}'::jsonb,
        provider_error TEXT,
        generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_div_ai_reviews_event ON dividend_ai_reviews (dividend_event_id, generated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_div_ai_reviews_issuer ON dividend_ai_reviews (issuer_id, generated_at DESC);
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
