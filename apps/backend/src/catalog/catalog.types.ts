import type { PaginationQuery } from '../http/pagination';

export const CATALOG_SORT_VALUES = ['newest', 'price_asc', 'price_desc'] as const;

export type CatalogSort = (typeof CATALOG_SORT_VALUES)[number];

export type CatalogListQuery = PaginationQuery & {
	sort: CatalogSort;
};

export type CatalogVariantSummary = {
	variant_id: string;
	unit_name: string;
	variant_name: string;
	nominal_price: string;
	current_price: string;
	available_quantity: number;
	is_available: boolean;
};

export type CatalogPriceSummary = {
	lowest_nominal_price: string;
	highest_nominal_price: string;
	lowest_current_price: string;
	highest_current_price: string;
};

export type CatalogStockSummary = {
	total_quantity: number;
	is_available: boolean;
};

export type CatalogProductListItem = {
	product_id: string;
	snapshot_id: string;
	title: string;
	price_summary: CatalogPriceSummary;
	stock_summary: CatalogStockSummary;
	variant_summaries: CatalogVariantSummary[];
	latest_snapshot_created_at: string;
};

export type CatalogProductDetail = CatalogProductListItem & {
	snapshot_content: {
		format: string;
		body: string;
		revert_policy: string | null;
	};
};

export type CatalogListResult = {
	items: CatalogProductListItem[];
	total: number;
};
