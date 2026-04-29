const RAW_API_BASE = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_API_URL : undefined

export const API_BASE = RAW_API_BASE?.replace(/\/+$/, '')

export function apiUrl(path: string): string | undefined {
  if (!API_BASE) return undefined
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE}${normalizedPath}`
}
