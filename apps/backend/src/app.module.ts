import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';

import { CartModule } from './cart/cart.module';
import { CatalogModule } from './catalog/catalog.module';
import { ContractController } from './contract/contract.controller';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { PaginationQueryPipe } from './http/pipes/pagination-query.pipe';
import { HttpMetricsMiddleware } from './metrics/http-metrics.middleware';
import { OrderModule } from './order/order.module';
import { BuyerAccessGuard } from './request-context/buyer-access.guard';
import { RequestContextController } from './request-context/request-context.controller';
import { RequestContextMiddleware } from './request-context/request-context.middleware';
import { RecommendationModule } from './recommendation/recommendation.module';
import { SearchModule } from './search/search.module';

@Module({
	imports: [DatabaseModule, CatalogModule, SearchModule, RecommendationModule, CartModule, OrderModule],
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
