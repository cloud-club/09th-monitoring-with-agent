export type ProductReadRow = {
	readonly sale_id: string;
	readonly snapshot_id: string;
	readonly snapshot_created_at: string | Date;
	readonly title: string;
	readonly format: string;
	readonly body: string;
	readonly revert_policy: string | null;
	readonly unit_name: string;
	readonly stock_id: string;
	readonly stock_name: string;
	readonly nominal_price: string;
	readonly real_price: string;
	readonly quantity: number;
	readonly stock_sequence: number;
	readonly unit_sequence: number;
};

export type ProductSearchRow = ProductReadRow & {
	readonly prefix_rank: number;
};

export type ProductRowsOptions = {
	readonly productId?: string;
	readonly titleQuery?: string;
};
