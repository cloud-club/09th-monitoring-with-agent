import { EntityManager } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';

import type { CatalogProductListItem, CatalogProductDetail, CatalogSort } from '../catalog/catalog.types';
import type { SearchProductsQuery, SearchProductsResult } from './search.types';

type SearchCatalogRow = {
	readonly sale_id: string;
	readonly snapshot_id: string;
	readonly snapshot_created_at: string | Date;
	readonly title: string;
	readonly format: string;
	readonly body: string;
	readonly revert_policy: string | null;
	readonly unit_name: string;
	readonly stock_id: string;
	readonly stock_name: string;
	readonly nominal_price: string;
	readonly real_price: string;
	readonly quantity: number;
	readonly stock_sequence: number;
	readonly unit_sequence: number;
	readonly prefix_rank: number;
};

const ACTIVE_SALE_FILTER_SQL = `
	s.opened_at IS NOT NULL
	AND s.closed_at IS NULL
	AND s.paused_at IS NULL
	AND s.suspended_at IS NULL
`;

const BASE_SEARCH_SQL = `
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

function toIsoString(value: string | Date): string {
	return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toPriceNumber(value: string): number {
	return Number(value);
}

function toPriceString(value: number): string {
	return value.toFixed(2);
}

function getLowestNumber(values: readonly number[]): number {
	return values.reduce((lowest, current) => (current < lowest ? current : lowest));
}

function getHighestNumber(values: readonly number[]): number {
	return values.reduce((highest, current) => (current > highest ? current : highest));
}

function createPriceSummary(variants: CatalogProductDetail['variant_summaries']) {
	const nominalPrices = variants.map((variant) => toPriceNumber(variant.nominal_price));
	const currentPrices = variants.map((variant) => toPriceNumber(variant.current_price));

	return {
		lowest_nominal_price: toPriceString(getLowestNumber(nominalPrices)),
		highest_nominal_price: toPriceString(getHighestNumber(nominalPrices)),
		lowest_current_price: toPriceString(getLowestNumber(currentPrices)),
		highest_current_price: toPriceString(getHighestNumber(currentPrices)),
	};
}

function createStockSummary(variants: CatalogProductDetail['variant_summaries']) {
	const totalQuantity = variants.reduce((sum, variant) => sum + variant.available_quantity, 0);

	return {
		total_quantity: totalQuantity,
		is_available: variants.some((variant) => variant.is_available),
	};
}

function mapSearchRows(rows: readonly SearchCatalogRow[]): Array<CatalogProductDetail & { readonly prefix_rank: number }> {
	const groupedRows = new Map<string, SearchCatalogRow[]>();

	for (const row of rows) {
		const existingRows = groupedRows.get(row.sale_id);
		if (existingRows === undefined) {
			groupedRows.set(row.sale_id, [row]);
			continue;
		}

		groupedRows.set(row.sale_id, [...existingRows, row]);
	}

	return [...groupedRows.values()].map((productRows) => {
		const [firstRow] = productRows;
		const sortedRows = [...productRows].sort((left, right) => {
			const unitDiff = left.unit_sequence - right.unit_sequence;
			if (unitDiff !== 0) {
				return unitDiff;
			}
			return left.stock_sequence - right.stock_sequence;
		});

		const variantSummaries = sortedRows.map((row) => ({
			variant_id: row.stock_id,
			unit_name: row.unit_name,
			variant_name: row.stock_name,
			nominal_price: toPriceString(toPriceNumber(row.nominal_price)),
			current_price: toPriceString(toPriceNumber(row.real_price)),
			available_quantity: row.quantity,
			is_available: row.quantity > 0,
		}));

		return {
			product_id: firstRow.sale_id,
			snapshot_id: firstRow.snapshot_id,
			title: firstRow.title,
			price_summary: createPriceSummary(variantSummaries),
			stock_summary: createStockSummary(variantSummaries),
			variant_summaries: variantSummaries,
			latest_snapshot_created_at: toIsoString(firstRow.snapshot_created_at),
			snapshot_content: {
				format: firstRow.format,
				body: firstRow.body,
				revert_policy: firstRow.revert_policy,
			},
			prefix_rank: firstRow.prefix_rank,
		};
	});
}

function toCatalogListItem(product: CatalogProductDetail): CatalogProductListItem {
	return {
		product_id: product.product_id,
		snapshot_id: product.snapshot_id,
		title: product.title,
		price_summary: product.price_summary,
		stock_summary: product.stock_summary,
		variant_summaries: product.variant_summaries,
		latest_snapshot_created_at: product.latest_snapshot_created_at,
	};
}

function compareSearchProducts(
	left: CatalogProductDetail & { readonly prefix_rank: number },
	right: CatalogProductDetail & { readonly prefix_rank: number },
): number {
	if (left.prefix_rank !== right.prefix_rank) {
		return left.prefix_rank - right.prefix_rank;
	}

	const titleDiff = left.title.localeCompare(right.title);
	if (titleDiff !== 0) {
		return titleDiff;
	}

	return left.product_id.localeCompare(right.product_id);
}

@Injectable()
export class SearchService {
	public constructor(@Inject(EntityManager) private readonly entityManager: EntityManager) {}

	public async searchProducts(query: SearchProductsQuery): Promise<SearchProductsResult> {
		const prefixPattern = `${query.q.toLowerCase()}%`;
		const containsPattern = `%${query.q.toLowerCase()}%`;
		const rows = await this.entityManager.getConnection().execute<SearchCatalogRow>(
			BASE_SEARCH_SQL,
			[prefixPattern, containsPattern],
			'all',
		);

		const products = mapSearchRows(rows).sort(compareSearchProducts).map(toCatalogListItem);
		const offset = (query.page - 1) * query.limit;

		return {
			items: products.slice(offset, offset + query.limit),
			total: products.length,
		};
	}
}
