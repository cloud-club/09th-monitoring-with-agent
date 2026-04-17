import type { ApiSuccessResponse } from '../http/contracts';

import type { OrderView } from './order.types';

export type OrderResponse = ApiSuccessResponse<{
	order: OrderView;
}>;
