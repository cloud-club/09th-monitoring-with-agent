import type { Request } from 'express';
import type { PaginationQuery } from '../http/pagination';
import type { SearchProductsResponse } from './search.controller.types';

import { Controller, Get, Inject, Query, Req } from '@nestjs/common';

import { ok } from '../http/contracts';
import { ERROR_CODES } from '../http/error-codes';
import { HttpError } from '../http/http-error';
import { createPaginationMeta } from '../http/pagination';
import { PaginationQueryPipe } from '../http/pipes/pagination-query.pipe';
import { AppLoggerService } from '../logging/app-logger.service';

import { SearchService } from './search.service';
import { validateSearchTerm } from './search.query';

@Controller('/api')
export class SearchController {
	public constructor(
		@Inject(AppLoggerService) private readonly appLogger: AppLoggerService,
		@Inject(SearchService) private readonly searchService: SearchService,
	) {}

	@Get('/search')
	public async searchProducts(
		@Req() request: Request,
		@Query(PaginationQueryPipe) paginationQuery: PaginationQuery,
		@Query('q') query: string | undefined,
	): Promise<SearchProductsResponse> {
		const validation = validateSearchTerm(query);

		if (!validation.ok) {
			this.appLogger.logDomainEvent({
				request,
				level: 'warn',
				eventName: 'search.executed',
				result: 'validation_error',
				errorCode: ERROR_CODES.VALIDATION_ERROR,
				fields: {
					query,
					issues: JSON.stringify(validation.issues),
				},
			});

			throw new HttpError(400, ERROR_CODES.VALIDATION_ERROR, 'Request validation failed', {
				issues: validation.issues,
			});
		}

		const result = await this.searchService.searchProducts({
			...paginationQuery,
			q: validation.value,
		});

		if (result.total === 0) {
			this.appLogger.logDomainEvent({
				request,
				eventName: 'search.executed',
				result: 'zero_result',
				fields: {
					query: validation.value,
					page: paginationQuery.page,
					limit: paginationQuery.limit,
				},
			});
		} else {
			this.appLogger.logDomainEvent({
				request,
				eventName: 'search.executed',
				result: 'success',
				fields: {
					query: validation.value,
					page: paginationQuery.page,
					limit: paginationQuery.limit,
					returned_count: result.items.length,
				},
			});
		}

		return ok(
			{
				items: result.items,
			},
			createPaginationMeta(paginationQuery, result.total),
		);
	}
}
