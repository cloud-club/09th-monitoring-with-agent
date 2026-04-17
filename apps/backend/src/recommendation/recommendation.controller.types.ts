import type { ApiSuccessResponse } from '../http/contracts';

import type { RecommendationListItem } from './recommendation.types';

export type RecommendationResponse = ApiSuccessResponse<{
	items: RecommendationListItem[];
}>;
