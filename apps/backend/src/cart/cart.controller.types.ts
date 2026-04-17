import type { ApiSuccessResponse } from '../http/contracts';

import type { CartView } from './cart.types';

export type CartResponse = ApiSuccessResponse<{
	cart: CartView;
}>;
