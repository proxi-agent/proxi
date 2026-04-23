import { Global, Module } from '@nestjs/common'

import { TasksController } from './tasks.controller.js'
import { TasksService } from './tasks.service.js'
import { TasksSignalsService } from './tasks.signals.service.js'

@Global()
@Module({
  controllers: [TasksController],
  providers: [TasksService, TasksSignalsService],
  exports: [TasksService, TasksSignalsService],
})
export class TasksModule {}
