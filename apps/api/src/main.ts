import 'dotenv/config'

import { NestFactory } from '@nestjs/core'

import { AppModule } from './app.module.js'

function parseCsv(value?: string): string[] {
  if (!value) {
    return []
  }
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function isAllowedOrigin(origin: string, allowedOrigins: string[], allowVercelPreviews: boolean, vercelPreviewSuffixes: string[]): boolean {
  if (allowedOrigins.includes(origin)) {
    return true
  }

  if (!allowVercelPreviews) {
    return false
  }

  if (!origin.startsWith('https://') || !origin.endsWith('.vercel.app')) {
    return false
  }

  if (!vercelPreviewSuffixes.length) {
    return true
  }

  return vercelPreviewSuffixes.some(suffix => origin.endsWith(suffix))
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const defaultOrigins = ['http://localhost:3000', 'http://localhost:3001']
  const allowedOrigins = parseCsv(process.env.CORS_ORIGIN)
  const allowVercelPreviews = process.env.CORS_ALLOW_VERCEL_PREVIEWS === 'true'
  const configuredVercelSuffixes = parseCsv(process.env.CORS_VERCEL_PREVIEW_SUFFIXES)
  const vercelPreviewSuffixes = configuredVercelSuffixes.map(suffix => (suffix.startsWith('.') ? suffix : `.${suffix}`))
  const effectiveAllowedOrigins = allowedOrigins.length ? allowedOrigins : defaultOrigins

  app.enableCors({
    credentials: true,
    origin(origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
      // Allow non-browser requests (no Origin header), e.g. health checks/curl/backend calls.
      if (!origin) {
        callback(null, true)
        return
      }

      const allowed = isAllowedOrigin(origin, effectiveAllowedOrigins, allowVercelPreviews, vercelPreviewSuffixes)
      callback(null, allowed)
    },
  })

  const port = Number(process.env.PORT || 3002)
  await app.listen(port, '0.0.0.0')
  // eslint-disable-next-line no-console
  console.log(`Backend server is running on http://localhost:${port}`)
}

bootstrap()
