import type { PaginationQuery } from '../http/pagination';
import type { CatalogDetailResponse, CatalogListResponse } from './catalog.controller.types';

import { Controller, Inject, Get, Param, Query } from '@nestjs/common';

import { ok } from '../http/contracts';
import { createPaginationMeta } from '../http/pagination';
import { PaginationQueryPipe } from '../http/pipes/pagination-query.pipe';

import { parseCatalogSort } from './catalog.query';
import { CatalogService } from './catalog.service';

@Controller('/api/catalog')
export class CatalogController {
	public constructor(@Inject(CatalogService) private readonly catalogService: CatalogService) {}

	@Get('/products')
	public async listProducts(
		@Query(PaginationQueryPipe) paginationQuery: PaginationQuery,
		@Query('sort') sort: string | undefined,
	): Promise<CatalogListResponse> {
		const result = await this.catalogService.listProducts({
			...paginationQuery,
			sort: parseCatalogSort(sort),
		});

		return ok(
			{
				items: result.items,
			},
			createPaginationMeta(paginationQuery, result.total),
		);
	}

	@Get('/products/:productId')
	public async getProduct(@Param('productId') productId: string): Promise<CatalogDetailResponse> {
		const product = await this.catalogService.getProduct(productId);

		return ok({ product });
	}
}
