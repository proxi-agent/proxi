import { Controller, Post } from '@nestjs/common'

import { Permissions } from '../auth/permissions.decorator.js'

import { SeedService } from './seed.service.js'

@Controller('seed')
export class SeedController {
  constructor(private readonly seedService: SeedService) {}

  @Permissions('agent.admin')
  @Post('ensure')
  async ensure() {
    const summary = await this.seedService.ensureSeeded()
    return { seeded: summary !== null, summary }
  }

  @Permissions('agent.admin')
  @Post('run')
  async run() {
    return this.seedService.seed()
  }

  @Permissions('agent.admin')
  @Post('reset')
  async reset() {
    await this.seedService.reset()
    return { ok: true }
  }
}
