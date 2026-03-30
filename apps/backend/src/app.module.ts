import { Module } from '@nestjs/common'
import { MikroOrmModule } from '@mikro-orm/nestjs'
import { SqliteDriver } from '@mikro-orm/sqlite'

import { HealthController } from './health/health.controller'
import { HealthCheckEntity } from './health/health-check.entity'
import { HealthService } from './health/health.service'

@Module({
  imports: [
    MikroOrmModule.forRoot({
      driver: SqliteDriver,
      dbName: ':memory:',
      allowGlobalContext: true,
      registerRequestContext: false,
      autoLoadEntities: true,
      entities: [HealthCheckEntity]
    })
  ],
  controllers: [HealthController],
  providers: [HealthService]
})
export class AppModule {}
