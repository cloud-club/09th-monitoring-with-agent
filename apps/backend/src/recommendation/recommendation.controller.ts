import type { Request } from 'express';
import type { RecommendationResponse } from './recommendation.controller.types';

import { Controller, Get, Inject, Param, Query, Req } from '@nestjs/common';

import { ok } from '../http/contracts';
import { AppLoggerService } from '../logging/app-logger.service';

import { parseRecommendationLimit } from './recommendation.query';
import { RecommendationService } from './recommendation.service';

@Controller('/api/catalog/products')
export class RecommendationController {
	public constructor(
		@Inject(AppLoggerService)
		private readonly appLogger: AppLoggerService,
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
		const result = await this.recommendationService.listRecommendations(productId, recommendationLimit);

		this.appLogger.logDomainEvent({
			request,
			eventName: 'recommendation.shown',
			result: result.items.length > 0 ? 'shown' : 'empty',
			fields: {
				product_id: productId,
				limit: recommendationLimit,
				returned_count: result.items.length,
			},
		});

		return ok({
			items: result.items,
		});
	}
}
