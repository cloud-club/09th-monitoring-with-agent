import type { PaginationQuery } from '../http/pagination';
import type { CatalogProductListItem } from '../catalog/catalog.types';

export type SearchProductsQuery = PaginationQuery & {
	q: string;
};

export type SearchProductsResult = {
	items: CatalogProductListItem[];
	total: number;
};
