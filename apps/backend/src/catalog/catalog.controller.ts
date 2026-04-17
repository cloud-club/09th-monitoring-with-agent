import type { PaginationQuery } from '../http/pagination';
import type { CatalogDetailResponse, CatalogListResponse } from './catalog.controller.types';

import type { Request } from 'express';

import { Controller, Inject, Get, Param, Query, Req } from '@nestjs/common';

import { ok } from '../http/contracts';
import { createPaginationMeta } from '../http/pagination';
import { PaginationQueryPipe } from '../http/pipes/pagination-query.pipe';
import { AppLoggerService } from '../logging/app-logger.service';

import { parseCatalogSort } from './catalog.query';
import { CatalogService } from './catalog.service';

@Controller('/api/catalog')
export class CatalogController {
	public constructor(
		@Inject(AppLoggerService) private readonly appLogger: AppLoggerService,
		@Inject(CatalogService) private readonly catalogService: CatalogService,
	) {}

	@Get('/products')
	public async listProducts(
		@Req() request: Request,
		@Query(PaginationQueryPipe) paginationQuery: PaginationQuery,
		@Query('sort') sort: string | undefined,
	): Promise<CatalogListResponse> {
		const result = await this.catalogService.listProducts({
			...paginationQuery,
			sort: parseCatalogSort(sort),
		});

		this.appLogger.logDomainEvent({
			request,
			eventName: 'product.list_viewed',
			result: result.items.length > 0 ? 'success' : 'empty',
			fields: {
				returned_count: result.items.length,
				page: paginationQuery.page,
				limit: paginationQuery.limit,
			},
		});

		return ok(
			{
				items: result.items,
			},
			createPaginationMeta(paginationQuery, result.total),
		);
	}

	@Get('/products/:productId')
	public async getProduct(@Req() request: Request, @Param('productId') productId: string): Promise<CatalogDetailResponse> {
		const product = await this.catalogService.getProduct(productId);

		this.appLogger.logDomainEvent({
			request,
			eventName: 'product.detail_viewed',
			result: 'success',
			fields: {
				product_id: productId,
				snapshot_id: product.snapshot_id,
			},
		});

		return ok({ product });
	}
}
