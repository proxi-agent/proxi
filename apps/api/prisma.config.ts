import 'dotenv/config'

import { defineConfig, env } from 'prisma/config'

const datasource: { url: ReturnType<typeof env>; shadowDatabaseUrl?: ReturnType<typeof env> } = {
  url: env('DATABASE_URL'),
}

if (process.env.SHADOW_DATABASE_URL) {
  datasource.shadowDatabaseUrl = env('SHADOW_DATABASE_URL')
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource,
})
