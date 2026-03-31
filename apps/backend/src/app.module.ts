import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';

import { ContractController } from './contract/contract.controller';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { PaginationQueryPipe } from './http/pipes/pagination-query.pipe';
import { HttpMetricsMiddleware } from './metrics/http-metrics.middleware';

@Module({
	imports: [DatabaseModule],
	controllers: [HealthController, ContractController],
	providers: [PaginationQueryPipe],
})
export class AppModule implements NestModule {
	public configure(consumer: MiddlewareConsumer): void {
		consumer.apply(HttpMetricsMiddleware).forRoutes({
			path: '*',
			method: RequestMethod.ALL,
		});
	}
}
