export type PaymentAttemptView = {
	payment_attempt_id: string;
	order_id: string;
	status: 'succeeded' | 'failed';
	amount: string;
	failure_code: string | null;
	request_key: string;
	created_at: string;
};

export type OrderPaymentView = {
	order_id: string;
	status: 'paid' | 'payment_failed';
	attempts: PaymentAttemptView[];
};
