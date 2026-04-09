export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://proxi-api-alb-1938160460.us-east-1.elb.amazonaws.com'

export function toApiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE_URL}${normalized}`
}
