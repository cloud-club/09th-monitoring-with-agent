import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';

import { CatalogModule } from './catalog/catalog.module';
import { ContractController } from './contract/contract.controller';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { PaginationQueryPipe } from './http/pipes/pagination-query.pipe';
import { HttpMetricsMiddleware } from './metrics/http-metrics.middleware';
import { BuyerAccessGuard } from './request-context/buyer-access.guard';
import { RequestContextController } from './request-context/request-context.controller';
import { RequestContextMiddleware } from './request-context/request-context.middleware';

@Module({
	imports: [DatabaseModule, CatalogModule],
	controllers: [HealthController, ContractController, RequestContextController],
	providers: [PaginationQueryPipe, BuyerAccessGuard],
})
export class AppModule implements NestModule {
	public configure(consumer: MiddlewareConsumer): void {
		consumer.apply(RequestContextMiddleware, HttpMetricsMiddleware).forRoutes({
			path: '*',
			method: RequestMethod.ALL,
		});
	}
}
