import type { ApiSuccessResponse } from '../http/contracts';
import type { PaginationMeta } from '../http/pagination';
import type { CatalogProductListItem } from '../catalog/catalog.types';

type SearchResponseMeta = {
	pagination: PaginationMeta;
};

export type SearchProductsResponse = ApiSuccessResponse<
	{ items: CatalogProductListItem[] },
	SearchResponseMeta
>;
