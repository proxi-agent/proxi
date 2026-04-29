const API_BEARER_TOKEN = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_API_BEARER_TOKEN : undefined
const API_DEMO_USER =
  typeof process !== 'undefined' ? (process.env.NEXT_PUBLIC_API_DEMO_USER ?? process.env.NEXT_PUBLIC_DEMO_USER) : undefined
const IS_PRODUCTION = typeof process !== 'undefined' ? process.env.NODE_ENV === 'production' : false

/**
 * Build API headers with optional local-dev auth.
 *
 * Priority:
 * 1) NEXT_PUBLIC_API_BEARER_TOKEN -> Authorization: Bearer <token>
 * 2) NEXT_PUBLIC_API_DEMO_USER    -> x-demo-user: <email/externalId> (non-production only)
 */
export function withApiAuthHeaders(headers?: HeadersInit): Headers {
  const out = new Headers(headers)
  if (!out.has('authorization') && API_BEARER_TOKEN) {
    out.set('authorization', `Bearer ${API_BEARER_TOKEN}`)
  } else if (!IS_PRODUCTION && !out.has('x-demo-user') && !out.has('authorization') && API_DEMO_USER) {
    out.set('x-demo-user', API_DEMO_USER)
  }
  return out
}
