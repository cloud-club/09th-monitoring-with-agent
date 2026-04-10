import type { ApiSuccessResponse } from '../http/contracts';
import type { PaginationMeta } from '../http/pagination';

import type { CatalogProductDetail, CatalogProductListItem } from './catalog.types';

type CatalogListResponseMeta = {
	pagination: PaginationMeta;
};

export type CatalogListResponse = ApiSuccessResponse<
	{ items: CatalogProductListItem[] },
	CatalogListResponseMeta
>;

export type CatalogDetailResponse = ApiSuccessResponse<{ product: CatalogProductDetail }>;
