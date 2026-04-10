import type { Request } from 'express';
import type { PaginationQuery } from '../http/pagination';
import type { SearchProductsResponse } from './search.controller.types';

import { Controller, Get, Inject, Logger, Query, Req } from '@nestjs/common';

import { ok } from '../http/contracts';
import { ERROR_CODES } from '../http/error-codes';
import { HttpError } from '../http/http-error';
import { createPaginationMeta } from '../http/pagination';
import { PaginationQueryPipe } from '../http/pipes/pagination-query.pipe';
import { getRequestTelemetryContext } from '../request-context/request-context';

import { SearchService } from './search.service';
import { validateSearchTerm } from './search.query';

@Controller('/api')
export class SearchController {
	private readonly logger = new Logger(SearchController.name);

	public constructor(@Inject(SearchService) private readonly searchService: SearchService) {}

	@Get('/search')
	public async searchProducts(
		@Req() request: Request,
		@Query(PaginationQueryPipe) paginationQuery: PaginationQuery,
		@Query('q') query: string | undefined,
	): Promise<SearchProductsResponse> {
		const telemetryContext = getRequestTelemetryContext(request);
		const validation = validateSearchTerm(query);

		if (!validation.ok) {
			this.logger.warn(
				JSON.stringify({
					event_name: 'search.executed',
					result: 'validation_failed',
					request_id: telemetryContext.requestId,
					user_role: telemetryContext.userRole,
					endpoint: '/api/search',
					error_code: ERROR_CODES.VALIDATION_ERROR,
					query,
					issues: validation.issues,
				}),
			);

			throw new HttpError(400, ERROR_CODES.VALIDATION_ERROR, 'Request validation failed', {
				issues: validation.issues,
			});
		}

		const result = await this.searchService.searchProducts({
			...paginationQuery,
			q: validation.value,
		});

		if (result.total === 0) {
			this.logger.log(
				JSON.stringify({
					event_name: 'search.executed',
					result: 'zero_result',
					request_id: telemetryContext.requestId,
					user_role: telemetryContext.userRole,
					endpoint: '/api/search',
					error_code: null,
					query: validation.value,
					page: paginationQuery.page,
					limit: paginationQuery.limit,
				}),
			);
		}

		return ok(
			{
				items: result.items,
			},
			createPaginationMeta(paginationQuery, result.total),
		);
	}
}
