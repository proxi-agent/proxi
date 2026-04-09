import { toApiUrl } from '@/lib/api'

type BrowserClerk = {
  session?: {
    getToken: () => Promise<string | null>
  }
}

async function getBearerToken(): Promise<string | null> {
  if (typeof window === 'undefined') {
    return null
  }
  const maybeClerk = (window as Window & { Clerk?: BrowserClerk }).Clerk
  if (!maybeClerk?.session) {
    return null
  }
  return maybeClerk.session.getToken()
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `${response.status} ${response.statusText}`)
  }
  return (await response.json()) as T
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const token = await getBearerToken()
  const response = await fetch(toApiUrl(path), {
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal,
  })
  return parseResponse<T>(response)
}

export async function apiPost<TRequest, TResponse>(path: string, body: TRequest): Promise<TResponse> {
  const token = await getBearerToken()
  const response = await fetch(toApiUrl(path), {
    body: JSON.stringify(body),
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })
  return parseResponse<TResponse>(response)
}
