import { Module } from '@nestjs/common'

import { ContractController } from './contract/contract.controller'
import { DatabaseModule } from './database/database.module'
import { HealthController } from './health/health.controller'

@Module({
  imports: [DatabaseModule],
  controllers: [HealthController, ContractController]
})
export class AppModule {}
