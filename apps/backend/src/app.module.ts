import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';

import { CartModule } from './cart/cart.module';
import { CatalogModule } from './catalog/catalog.module';
import { ContractController } from './contract/contract.controller';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { PaginationQueryPipe } from './http/pipes/pagination-query.pipe';
import { IssueModule } from './issue/issue.module';
import { LoggingModule } from './logging/logging.module';
import { RequestLoggingMiddleware } from './logging/request-logging.middleware';
import { HttpMetricsMiddleware } from './metrics/http-metrics.middleware';
import { MetricsController } from './metrics/metrics.controller';
import { OrderModule } from './order/order.module';
import { PaymentModule } from './payment/payment.module';
import { RecommendationModule } from './recommendation/recommendation.module';
import { BuyerAccessGuard } from './request-context/buyer-access.guard';
import { RequestContextController } from './request-context/request-context.controller';
import { RequestContextMiddleware } from './request-context/request-context.middleware';
import { SearchModule } from './search/search.module';
import { HttpTraceMiddleware } from './telemetry/http-trace.middleware';

@Module({
	imports: [LoggingModule, DatabaseModule, CatalogModule, SearchModule, RecommendationModule, CartModule, OrderModule, PaymentModule, IssueModule],
	controllers: [HealthController, ContractController, MetricsController, RequestContextController],
	providers: [PaginationQueryPipe, BuyerAccessGuard],
})
export class AppModule implements NestModule {
	public configure(consumer: MiddlewareConsumer): void {
		consumer.apply(RequestContextMiddleware, HttpTraceMiddleware, RequestLoggingMiddleware, HttpMetricsMiddleware).forRoutes({
			path: '*',
			method: RequestMethod.ALL,
		});
	}
}
