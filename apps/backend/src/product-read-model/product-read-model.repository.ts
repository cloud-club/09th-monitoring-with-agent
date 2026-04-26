import type { CatalogListQuery, CatalogListResult, CatalogProductDetail, CatalogProductListItem, CatalogSort } from '../catalog/catalog.types';
import type { PaginationQuery } from '../http/pagination';

import type { SearchProductsResult } from '../search/search.types';
import type { ProductReadRow, ProductRowsOptions, ProductSearchRow } from './product-read-model.types';
import { EntityManager } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../http/http-error';

import {
	compareSearchProducts,
	mapProductRows,
	mapSearchProductRows,
	sortCatalogProducts,
	toCatalogListItem,
} from './product-read-model.mapper';

type ProductSearchQuery = PaginationQuery & {
	readonly q: string;
};

const ACTIVE_SALE_FILTER_SQL = `
	s.opened_at IS NOT NULL
	AND s.closed_at IS NULL
	AND s.paused_at IS NULL
	AND s.suspended_at IS NULL
`;

const PRODUCT_READ_CTE_SQL = `
	WITH latest_snapshots AS (
		SELECT
			ss.id,
			ss.sale_id,
			ss.created_at,
			ROW_NUMBER() OVER (
				PARTITION BY ss.sale_id
				ORDER BY ss.created_at DESC, ss.id DESC
			) AS snapshot_rank
		FROM sale_snapshots ss
	),
	canonical_contents AS (
		SELECT
			content.id,
			content.sale_snapshot_id,
			content.title,
			content.format,
			content.body,
			content.revert_policy,
			ROW_NUMBER() OVER (
				PARTITION BY content.sale_snapshot_id
				ORDER BY content.id DESC
			) AS content_rank
		FROM sale_snapshot_contents content
	)
`;

const PRODUCT_READ_SELECT_SQL = `
	SELECT
		s.id AS sale_id,
		ls.id AS snapshot_id,
		ls.created_at AS snapshot_created_at,
		content.title,
		content.format,
		content.body,
		content.revert_policy,
		unit.name AS unit_name,
		stock.id AS stock_id,
		stock.name AS stock_name,
		stock.nominal_price::text AS nominal_price,
		stock.real_price::text AS real_price,
		stock.quantity,
		stock.sequence AS stock_sequence,
		unit.sequence AS unit_sequence
	FROM sales s
	JOIN latest_snapshots ls
		ON ls.sale_id = s.id
		AND ls.snapshot_rank = 1
	JOIN canonical_contents content
		ON content.sale_snapshot_id = ls.id
		AND content.content_rank = 1
	JOIN sale_snapshot_units unit
		ON unit.sale_snapshot_id = ls.id
	JOIN sale_snapshot_unit_stocks stock
		ON stock.sale_snapshot_unit_id = unit.id
	WHERE ${ACTIVE_SALE_FILTER_SQL}
`;

const PRODUCT_SEARCH_SELECT_SQL = `
	SELECT
		s.id AS sale_id,
		ls.id AS snapshot_id,
		ls.created_at AS snapshot_created_at,
		content.title,
		content.format,
		content.body,
		content.revert_policy,
		unit.name AS unit_name,
		stock.id AS stock_id,
		stock.name AS stock_name,
		stock.nominal_price::text AS nominal_price,
		stock.real_price::text AS real_price,
		stock.quantity,
		stock.sequence AS stock_sequence,
		unit.sequence AS unit_sequence,
		CASE WHEN LOWER(content.title) LIKE LOWER(?) THEN 0 ELSE 1 END AS prefix_rank
	FROM sales s
	JOIN latest_snapshots ls
		ON ls.sale_id = s.id
		AND ls.snapshot_rank = 1
	JOIN canonical_contents content
		ON content.sale_snapshot_id = ls.id
		AND content.content_rank = 1
	JOIN sale_snapshot_units unit
		ON unit.sale_snapshot_id = ls.id
	JOIN sale_snapshot_unit_stocks stock
		ON stock.sale_snapshot_unit_id = unit.id
	WHERE ${ACTIVE_SALE_FILTER_SQL}
	AND LOWER(content.title) LIKE LOWER(?)
`;

function paginate<TItem>(items: readonly TItem[], query: PaginationQuery): { items: TItem[]; total: number } {
	const offset = (query.page - 1) * query.limit;

	return {
		items: items.slice(offset, offset + query.limit),
		total: items.length,
	};
}

@Injectable()
export class ProductReadModelRepository {
	public constructor(@Inject(EntityManager) private readonly entityManager: EntityManager) {}

	public async loadRows(options: ProductRowsOptions = {}): Promise<ProductReadRow[]> {
		const clauses: string[] = [];
		const params: string[] = [];

		if (options.productId !== undefined) {
			clauses.push('AND s.id = ?');
			params.push(options.productId);
		}

		if (options.titleQuery !== undefined) {
			clauses.push('AND LOWER(content.title) LIKE LOWER(?)');
			params.push(`%${options.titleQuery}%`);
		}

		const sql = `${PRODUCT_READ_CTE_SQL}
			${PRODUCT_READ_SELECT_SQL}
			${clauses.join('\n')}
		`;

		return await this.entityManager.getConnection().execute(sql, params, 'all') as unknown as ProductReadRow[];
	}

	public async listProducts(query: CatalogListQuery): Promise<CatalogListResult> {
		const products = sortCatalogProducts(
			mapProductRows(await this.loadRows()).map(toCatalogListItem),
			query.sort,
		);

		return paginate(products, query);
	}

	public async getProduct(productId: string): Promise<CatalogProductDetail> {
		const [product] = mapProductRows(await this.loadRows({ productId }));

		if (product === undefined) {
			throw new NotFoundError('Catalog product not found');
		}

		return product;
	}

	public async listAllProducts(sort: CatalogSort): Promise<CatalogProductListItem[]> {
		return sortCatalogProducts(
			mapProductRows(await this.loadRows()).map(toCatalogListItem),
			sort,
		);
	}

	public async searchProducts(query: ProductSearchQuery): Promise<SearchProductsResult> {
		const prefixPattern = `${query.q.toLowerCase()}%`;
		const containsPattern = `%${query.q.toLowerCase()}%`;
		const rows = await this.entityManager.getConnection().execute(
			`${PRODUCT_READ_CTE_SQL}
			${PRODUCT_SEARCH_SELECT_SQL}`,
			[prefixPattern, containsPattern],
			'all',
		) as unknown as ProductSearchRow[];

		const products = mapSearchProductRows(rows).sort(compareSearchProducts).map(toCatalogListItem);
		return paginate(products, query);
	}
}
