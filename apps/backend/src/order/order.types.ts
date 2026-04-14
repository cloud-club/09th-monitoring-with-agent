export type OrderLine = {
	order_item_id: string;
	cart_item_id: string;
	product_id: string;
	snapshot_id: string;
	variant_id: string;
	title: string;
	variant_name: string;
	quantity: number;
	unit_price: string;
	line_total: string;
};

export type OrderView = {
	order_id: string;
	customer_id: string;
	address_id: string | null;
	status: 'pending_payment' | 'payment_failed' | 'paid';
	items: OrderLine[];
	total_amount: string;
};
