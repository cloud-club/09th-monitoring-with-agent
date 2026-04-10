import type { CatalogProductListItem } from '../catalog/catalog.types';

export const RECOMMENDATION_LIMIT_DEFAULT = 4;
export const RECOMMENDATION_LIMIT_MAX = 4;

export type RecommendationListItem = CatalogProductListItem;

export type RecommendationResult = {
	items: RecommendationListItem[];
};
