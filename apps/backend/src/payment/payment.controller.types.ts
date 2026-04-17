import type { ApiSuccessResponse } from '../http/contracts';

import type { PaymentAttemptView } from './payment.types';

export type PaymentAttemptResponse = ApiSuccessResponse<{
	attempt: PaymentAttemptView;
}>;

export type PaymentAttemptListResponse = ApiSuccessResponse<{
	attempts: PaymentAttemptView[];
}>;
