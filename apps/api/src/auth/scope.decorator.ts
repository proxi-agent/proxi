import { SetMetadata } from '@nestjs/common'

export type ScopePath = `body.${string}` | `params.${string}` | `query.${string}`

export interface ScopeEntityRule {
  /**
   * Logical entity kind; guard maps this to table lookups for issuer/account
   * ownership checks.
   */
  entity: 'account' | 'ballot' | 'dividend' | 'dividend_batch' | 'meeting' | 'shareholder' | 'task' | 'transfer'
  /** Request param that carries the entity id (default: "id"). */
  idParam?: string
}

export interface ScopeRule {
  /** Paths holding issuer id values that must be issuer-accessible. */
  issuerPaths?: ScopePath[]
  /** Paths with account ids that must belong to the authenticated shareholder. */
  accountPaths?: ScopePath[]
  /** Paths with shareholder ids that must belong to the authenticated shareholder. */
  shareholderPaths?: ScopePath[]
  /**
   * If an issuer-scoped role calls a route with no issuer in the path/query/body,
   * inject their single issuer id into this path for list ergonomics.
   */
  autoFillIssuerPath?: ScopePath
  /**
   * Similar default for shareholder account views (e.g. list transfers).
   */
  autoFillAccountPath?: ScopePath
  /** Default shareholder id for investor-scoped list routes. */
  autoFillShareholderPath?: ScopePath
  /** Optional entity-id based ownership resolution. */
  entityRule?: ScopeEntityRule
}

export const SCOPE_KEY = 'auth_scope'
export const Scope = (rule: ScopeRule) => SetMetadata(SCOPE_KEY, rule)
