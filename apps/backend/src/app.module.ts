import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';

import { CartModule } from './cart/cart.module';
import { CatalogModule } from './catalog/catalog.module';
import { ContractModule } from './contract/contract.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { PaginationQueryPipe } from './http/pipes/pagination-query.pipe';
import { RequestLoggingMiddleware } from './logging/request-logging.middleware';
import { HttpMetricsMiddleware } from './metrics/http-metrics.middleware';
import { EmailNotifierModule } from './notification/email-notifier.module';
import { ObservabilityModule } from './observability/observability.module';
import { OrderModule } from './order/order.module';
import { PaymentModule } from './payment/payment.module';
import { QaFaultInjectionMiddleware } from './qa/qa-fault-injection.middleware';
import { QaModule } from './qa/qa.module';
import { RecommendationModule } from './recommendation/recommendation.module';
import { RequestContextMiddleware } from './request-context/request-context.middleware';
import { RequestContextModule } from './request-context/request-context.module';
import { SearchModule } from './search/search.module';
import { HttpTraceMiddleware } from './telemetry/http-trace.middleware';

@Module({
	imports: [
		ObservabilityModule,
		RequestContextModule,
		QaModule,
		HealthModule,
		ContractModule,
		DatabaseModule,
		EmailNotifierModule,
		CatalogModule,
		SearchModule,
		RecommendationModule,
		CartModule,
		OrderModule,
		PaymentModule,
	],
	providers: [PaginationQueryPipe],
})
export class AppModule implements NestModule {
	public configure(consumer: MiddlewareConsumer): void {
		consumer
			.apply(RequestContextMiddleware, HttpTraceMiddleware, RequestLoggingMiddleware, HttpMetricsMiddleware, QaFaultInjectionMiddleware)
			.forRoutes({
				path: '*',
				method: RequestMethod.ALL,
			});
	}
}
