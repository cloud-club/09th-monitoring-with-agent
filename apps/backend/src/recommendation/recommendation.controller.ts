import type { Request } from 'express';
import type { RecommendationResponse } from './recommendation.controller.types';

import { Controller, Get, Inject, Logger, Param, Query, Req } from '@nestjs/common';

import { ok } from '../http/contracts';
import { getRequestTelemetryContext } from '../request-context/request-context';

import { parseRecommendationLimit } from './recommendation.query';
import { RecommendationService } from './recommendation.service';

@Controller('/api/catalog/products')
export class RecommendationController {
	private readonly logger = new Logger(RecommendationController.name);

	public constructor(
		@Inject(RecommendationService)
		private readonly recommendationService: RecommendationService,
	) {}

	@Get('/:productId/recommendations')
	public async listRecommendations(
		@Req() request: Request,
		@Param('productId') productId: string,
		@Query('limit') limit: string | undefined,
	): Promise<RecommendationResponse> {
		const recommendationLimit = parseRecommendationLimit(limit);
		const telemetryContext = getRequestTelemetryContext(request);

		const result = await this.recommendationService.listRecommendations(productId, recommendationLimit);

		this.logger.log(
			JSON.stringify({
				event_name: 'recommendation.shown',
				result: result.items.length > 0 ? 'shown' : 'empty',
				request_id: telemetryContext.requestId,
				user_role: telemetryContext.userRole,
				endpoint: '/api/catalog/products/:productId/recommendations',
				error_code: null,
				source_product_id: productId,
				limit: recommendationLimit,
				returned_count: result.items.length,
			}),
		);

		return ok({
			items: result.items,
		});
	}
}
