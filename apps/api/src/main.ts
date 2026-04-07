import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.js'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const corsOrigin = process.env.CORS_ORIGIN
  const defaultOrigins = ['http://localhost:3000', 'http://localhost:3001']
  const allowedOrigins = corsOrigin ? corsOrigin.split(',').map(origin => origin.trim()) : defaultOrigins

  app.enableCors({
    credentials: true,
    origin: allowedOrigins,
  })

  const port = process.env.PORT || 3002
  await app.listen(port)
  // eslint-disable-next-line no-console
  console.log(`Backend server is running on http://localhost:${port}`)
}

bootstrap()
