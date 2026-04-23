import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { PoolClient } from 'pg'

import { AuditService } from '../audit/audit.service.js'
import type { ActorContext } from '../common/actor.js'
import type { PaginatedResponse } from '../common/pagination.js'
import { buildPaginated, pageOffset, resolveSort } from '../common/pagination.js'
import { shortId } from '../common/uid.js'
import { DatabaseService } from '../database/database.service.js'

import type {
  CreateAccountDto,
  CreateShareholderDto,
  ShareholderListQuery,
  UpdateAccountDto,
  UpdateShareholderDto,
} from './shareholders.dto.js'
import type {
  AccountStatus,
  HolderClassification,
  HolderKind,
  KycStatus,
  RegistrationType,
  RiskTier,
  Shareholder,
  ShareholderAccount,
  ShareholderStatus,
} from './shareholders.types.js'

type ShareholderRow = {
  id: string
  issuer_id: string
  holder_kind: HolderKind
  legal_name: string
  classification: HolderClassification
  jurisdiction: string | null
  risk_tier: RiskTier
  email: string | null
  phone: string | null
  tax_id_last4: string | null
  status: ShareholderStatus
  kyc_status: KycStatus
  metadata: Record<string, unknown>
  created_at: Date
  updated_at: Date
}

type AccountRow = {
  id: string
  shareholder_id: string
  issuer_id: string
  account_number: string
  registration_type: RegistrationType
  status: AccountStatus
  primary_email: string | null
  address: Record<string, unknown>
  metadata: Record<string, unknown>
  created_at: Date
  updated_at: Date
}

const SORTABLE: Record<string, string> = {
  classification: 'classification',
  createdAt: 'created_at',
  legalName: 'legal_name',
  riskTier: 'risk_tier',
  status: 'status',
}

@Injectable()
export class ShareholdersService {
  constructor(
    private readonly database: DatabaseService,
    private readonly auditService: AuditService,
  ) {}

  async list(query: ShareholderListQuery): Promise<PaginatedResponse<Shareholder>> {
    const where: string[] = []
    const params: unknown[] = []

    if (query.issuerId) {
      params.push(query.issuerId)
      where.push(`issuer_id = $${params.length}`)
    }
    if (query.holderKind) {
      params.push(query.holderKind)
      where.push(`holder_kind = $${params.length}`)
    }
    if (query.classification) {
      params.push(query.classification)
      where.push(`classification = $${params.length}`)
    }
    if (query.status) {
      params.push(query.status)
      where.push(`status = $${params.length}`)
    }
    if (query.riskTier) {
      params.push(query.riskTier)
      where.push(`risk_tier = $${params.length}`)
    }
    if (query.kycStatus) {
      params.push(query.kycStatus)
      where.push(`kyc_status = $${params.length}`)
    }
    if (query.q) {
      params.push(`%${query.q.toLowerCase()}%`)
      where.push(`(LOWER(legal_name) LIKE $${params.length} OR LOWER(COALESCE(email, '')) LIKE $${params.length})`)
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const sort = resolveSort(query, SORTABLE, { column: 'legal_name', dir: 'asc' })

    const countResult = await this.database.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM shareholders ${whereSql}`, params)
    const total = Number(countResult.rows[0]?.count || '0')

    params.push(query.pageSize)
    const limitParam = params.length
    params.push(pageOffset(query))
    const offsetParam = params.length

    const rows = await this.database.query<ShareholderRow>(
      `SELECT * FROM shareholders ${whereSql}
       ORDER BY ${sort.column} ${sort.dir.toUpperCase()}
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params,
    )
    return buildPaginated(rows.rows.map(mapShareholder), total, query)
  }

  async getById(id: string, withAccounts = true): Promise<Shareholder> {
    const result = await this.database.query<ShareholderRow>(`SELECT * FROM shareholders WHERE id = $1`, [id])
    if (!result.rows.length) {
      throw new NotFoundException(`Shareholder ${id} not found`)
    }
    const shareholder = mapShareholder(result.rows[0])
    if (withAccounts) {
      shareholder.accounts = await this.listAccounts(id)
    }
    return shareholder
  }

  async listAccounts(shareholderId: string): Promise<ShareholderAccount[]> {
    const rows = await this.database.query<AccountRow>(
      `SELECT * FROM shareholder_accounts WHERE shareholder_id = $1 ORDER BY account_number ASC`,
      [shareholderId],
    )
    return rows.rows.map(mapAccount)
  }

  async create(input: CreateShareholderDto, actor: ActorContext): Promise<Shareholder> {
    const id = shortId('sh')
    return this.database.tx(async client => {
      const issuer = await client.query(`SELECT id FROM issuers WHERE id = $1`, [input.issuerId])
      if (!issuer.rows.length) {
        throw new NotFoundException(`Issuer ${input.issuerId} not found`)
      }
      const result = await client.query<ShareholderRow>(
        `INSERT INTO shareholders (id, issuer_id, holder_kind, legal_name, classification, jurisdiction, risk_tier, email, phone, tax_id_last4, status, kyc_status, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb) RETURNING *`,
        [
          id,
          input.issuerId,
          input.holderKind || 'REGISTERED',
          input.legalName,
          input.classification || 'RETAIL',
          input.jurisdiction || null,
          input.riskTier || 'LOW',
          input.email || null,
          input.phone || null,
          input.taxIdLast4 || null,
          input.status || 'ACTIVE',
          input.kycStatus || 'PENDING',
          JSON.stringify(input.metadata || {}),
        ],
      )
      await this.auditService.record(
        {
          action: 'SHAREHOLDER_CREATED',
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: id,
          entityType: 'SHAREHOLDER',
          issuerId: input.issuerId,
          metadata: { classification: input.classification, legalName: input.legalName },
        },
        client,
      )
      return mapShareholder(result.rows[0])
    })
  }

  async update(id: string, input: UpdateShareholderDto, actor: ActorContext): Promise<Shareholder> {
    return this.database.tx(async client => {
      const existing = await client.query<ShareholderRow>(`SELECT * FROM shareholders WHERE id = $1 FOR UPDATE`, [id])
      if (!existing.rows.length) {
        throw new NotFoundException(`Shareholder ${id} not found`)
      }
      const current = existing.rows[0]
      const result = await client.query<ShareholderRow>(
        `UPDATE shareholders SET
           holder_kind = $2, legal_name = $3, classification = $4, jurisdiction = $5, risk_tier = $6,
           email = $7, phone = $8, tax_id_last4 = $9, status = $10, kyc_status = $11, metadata = $12::jsonb, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [
          id,
          input.holderKind ?? current.holder_kind,
          input.legalName ?? current.legal_name,
          input.classification ?? current.classification,
          input.jurisdiction ?? current.jurisdiction,
          input.riskTier ?? current.risk_tier,
          input.email ?? current.email,
          input.phone ?? current.phone,
          input.taxIdLast4 ?? current.tax_id_last4,
          input.status ?? current.status,
          input.kycStatus ?? current.kyc_status,
          JSON.stringify({ ...current.metadata, ...(input.metadata || {}) }),
        ],
      )
      await this.auditService.record(
        {
          action: 'SHAREHOLDER_UPDATED',
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: id,
          entityType: 'SHAREHOLDER',
          issuerId: current.issuer_id,
          metadata: {},
        },
        client,
      )
      return mapShareholder(result.rows[0])
    })
  }

  async addAccount(input: CreateAccountDto, actor: ActorContext): Promise<ShareholderAccount> {
    return this.database.tx(async client => {
      const shareholder = await this.findShareholderForUpdate(client, input.shareholderId)
      const id = shortId('acct')
      const duplicate = await client.query(`SELECT id FROM shareholder_accounts WHERE issuer_id = $1 AND account_number = $2`, [
        shareholder.issuer_id,
        input.accountNumber,
      ])
      if (duplicate.rows.length) {
        throw new BadRequestException(`Account number ${input.accountNumber} already exists for this issuer`)
      }
      const result = await client.query<AccountRow>(
        `INSERT INTO shareholder_accounts (id, shareholder_id, issuer_id, account_number, registration_type, status, primary_email, address, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb) RETURNING *`,
        [
          id,
          input.shareholderId,
          shareholder.issuer_id,
          input.accountNumber,
          input.registrationType || 'INDIVIDUAL',
          input.status || 'ACTIVE',
          input.primaryEmail || null,
          JSON.stringify(input.address || {}),
          JSON.stringify(input.metadata || {}),
        ],
      )
      await this.auditService.record(
        {
          action: 'ACCOUNT_CREATED',
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: id,
          entityType: 'SHAREHOLDER_ACCOUNT',
          issuerId: shareholder.issuer_id,
          metadata: { accountNumber: input.accountNumber, shareholderId: input.shareholderId },
        },
        client,
      )
      return mapAccount(result.rows[0])
    })
  }

  async updateAccount(id: string, input: UpdateAccountDto, actor: ActorContext): Promise<ShareholderAccount> {
    return this.database.tx(async client => {
      const existing = await client.query<AccountRow>(`SELECT * FROM shareholder_accounts WHERE id = $1 FOR UPDATE`, [id])
      if (!existing.rows.length) {
        throw new NotFoundException(`Account ${id} not found`)
      }
      const current = existing.rows[0]
      const result = await client.query<AccountRow>(
        `UPDATE shareholder_accounts SET
           registration_type = $2, status = $3, primary_email = $4, address = $5::jsonb, metadata = $6::jsonb, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [
          id,
          input.registrationType ?? current.registration_type,
          input.status ?? current.status,
          input.primaryEmail ?? current.primary_email,
          JSON.stringify({ ...current.address, ...(input.address || {}) }),
          JSON.stringify({ ...current.metadata, ...(input.metadata || {}) }),
        ],
      )
      await this.auditService.record(
        {
          action: 'ACCOUNT_UPDATED',
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          entityId: id,
          entityType: 'SHAREHOLDER_ACCOUNT',
          issuerId: current.issuer_id,
          metadata: {},
        },
        client,
      )
      return mapAccount(result.rows[0])
    })
  }

  async findAccountByNumber(issuerId: string, accountNumber: string): Promise<ShareholderAccount | null> {
    const result = await this.database.query<AccountRow>(
      `SELECT * FROM shareholder_accounts WHERE issuer_id = $1 AND account_number = $2`,
      [issuerId, accountNumber],
    )
    return result.rows.length ? mapAccount(result.rows[0]) : null
  }

  async getAccount(id: string): Promise<ShareholderAccount> {
    const result = await this.database.query<AccountRow>(`SELECT * FROM shareholder_accounts WHERE id = $1`, [id])
    if (!result.rows.length) {
      throw new NotFoundException(`Account ${id} not found`)
    }
    return mapAccount(result.rows[0])
  }

  async listAccountsByIssuer(issuerId: string): Promise<ShareholderAccount[]> {
    const rows = await this.database.query<AccountRow>(
      `SELECT * FROM shareholder_accounts WHERE issuer_id = $1 ORDER BY account_number ASC`,
      [issuerId],
    )
    return rows.rows.map(mapAccount)
  }

  private async findShareholderForUpdate(client: PoolClient, shareholderId: string): Promise<ShareholderRow> {
    const result = await client.query<ShareholderRow>(`SELECT * FROM shareholders WHERE id = $1 FOR UPDATE`, [shareholderId])
    if (!result.rows.length) {
      throw new NotFoundException(`Shareholder ${shareholderId} not found`)
    }
    return result.rows[0]
  }
}

function mapShareholder(row: ShareholderRow): Shareholder {
  return {
    classification: row.classification,
    createdAt: new Date(row.created_at),
    email: row.email || undefined,
    holderKind: row.holder_kind,
    id: row.id,
    issuerId: row.issuer_id,
    jurisdiction: row.jurisdiction || undefined,
    kycStatus: row.kyc_status,
    legalName: row.legal_name,
    metadata: row.metadata || {},
    phone: row.phone || undefined,
    riskTier: row.risk_tier,
    status: row.status,
    taxIdLast4: row.tax_id_last4 || undefined,
    updatedAt: new Date(row.updated_at),
  }
}

function mapAccount(row: AccountRow): ShareholderAccount {
  return {
    accountNumber: row.account_number,
    address: row.address || {},
    createdAt: new Date(row.created_at),
    id: row.id,
    issuerId: row.issuer_id,
    metadata: row.metadata || {},
    primaryEmail: row.primary_email || undefined,
    registrationType: row.registration_type,
    shareholderId: row.shareholder_id,
    status: row.status,
    updatedAt: new Date(row.updated_at),
  }
}
