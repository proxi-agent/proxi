import { Global, Module } from '@nestjs/common'

import { TasksController } from './tasks.controller.js'
import { TasksService } from './tasks.service.js'

@Global()
@Module({
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
