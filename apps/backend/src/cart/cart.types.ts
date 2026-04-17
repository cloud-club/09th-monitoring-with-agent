export const CART_ITEM_MAX_QUANTITY = 20;

export type CartLine = {
	cart_item_id: string;
	product_id: string;
	snapshot_id: string;
	variant_id: string;
	title: string;
	variant_name: string;
	quantity: number;
	max_quantity: number;
	available_quantity: number;
	is_available: boolean;
	current_price: string;
};

export type CartView = {
	cart_id: string;
	customer_id: string;
	items: CartLine[];
};
