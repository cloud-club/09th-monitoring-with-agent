import type { EntityManager } from '@mikro-orm/core';
import type { OrderLine, OrderView } from './order.types';
import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { NotFoundError } from '../http/http-error';

export type CartCheckoutRow = {
	readonly cart_id: string;
	readonly customer_id: string;
	readonly cart_item_id: string;
	readonly snapshot_id: string;
	readonly current_snapshot_id: string | null;
	readonly variant_id: string;
	readonly quantity: number;
	readonly product_id: string | null;
	readonly title: string | null;
	readonly variant_name: string | null;
	readonly available_quantity: number | null;
	readonly current_price: string | null;
	readonly seller_customer_id: string | null;
};

type OrderRow = {
	readonly order_id: string;
	readonly customer_id: string;
	readonly address_id: string | null;
	readonly status: 'pending_payment' | 'payment_failed' | 'paid';
	readonly order_item_id: string;
	readonly cart_item_id: string;
	readonly snapshot_id: string;
	readonly variant_id: string;
	readonly product_id: string;
	readonly title: string;
	readonly variant_name: string;
	readonly quantity: number;
	readonly unit_price: string;
	readonly line_total: string;
};

const CHECKOUT_CART_SQL = `
	WITH canonical_contents AS (
		SELECT
			content.sale_snapshot_id,
			content.title,
			ROW_NUMBER() OVER (
				PARTITION BY content.sale_snapshot_id
				ORDER BY content.id DESC
			) AS content_rank
		FROM sale_snapshot_contents content
	),
	latest_snapshots AS (
		SELECT
			ss.id,
			ss.sale_id,
			ROW_NUMBER() OVER (
				PARTITION BY ss.sale_id
				ORDER BY ss.created_at DESC, ss.id DESC
			) AS snapshot_rank
		FROM sale_snapshots ss
	),
	current_variant_state AS (
		SELECT
			stock.id AS variant_id,
			ls.sale_id AS product_id,
			ls.id AS current_snapshot_id,
			content.title,
			stock.name AS variant_name,
			stock.quantity AS available_quantity,
			stock.real_price::text AS current_price,
			sale.seller_customer_id
		FROM latest_snapshots ls
		JOIN canonical_contents content
			ON content.sale_snapshot_id = ls.id
			AND content.content_rank = 1
		JOIN sale_snapshot_units unit
			ON unit.sale_snapshot_id = ls.id
		JOIN sale_snapshot_unit_stocks stock
			ON stock.sale_snapshot_unit_id = unit.id
		JOIN sales sale
			ON sale.id = ls.sale_id
		WHERE ls.snapshot_rank = 1
		AND sale.opened_at IS NOT NULL
		AND sale.closed_at IS NULL
		AND sale.paused_at IS NULL
		AND sale.suspended_at IS NULL
	)
	SELECT
		c.id AS cart_id,
		c.customer_id,
		ci.id AS cart_item_id,
		ci.sale_snapshot_id AS snapshot_id,
		current_variant_state.current_snapshot_id,
		cis.sale_snapshot_unit_stock_id AS variant_id,
		cis.quantity,
		current_variant_state.product_id,
		current_variant_state.title,
		current_variant_state.variant_name,
		current_variant_state.available_quantity,
		current_variant_state.current_price,
		current_variant_state.seller_customer_id
	FROM carts c
	JOIN cart_items ci
		ON ci.cart_id = c.id
		AND ci.deleted_at IS NULL
	LEFT JOIN order_items existing_order_item
		ON existing_order_item.cart_item_id = ci.id
	JOIN cart_item_stocks cis
		ON cis.cart_item_id = ci.id
	LEFT JOIN current_variant_state
		ON current_variant_state.variant_id = cis.sale_snapshot_unit_stock_id
	WHERE c.id = ?
	AND c.customer_id = ?
	AND c.deleted_at IS NULL
	AND c.actor_type = 'buyer'
	AND existing_order_item.id IS NULL
	ORDER BY ci.created_at ASC, ci.id ASC
`;

const ORDER_VIEW_SQL = `
	SELECT
		o.id AS order_id,
		o.customer_id,
		o.address_id,
		CASE
			WHEN payment.id IS NOT NULL THEN 'paid'
			WHEN latest_attempt.status = 'failed' THEN 'payment_failed'
			ELSE 'pending_payment'
		END AS status,
		oi.id AS order_item_id,
		oi.cart_item_id,
		ci.sale_snapshot_id AS snapshot_id,
		cis.sale_snapshot_unit_stock_id AS variant_id,
		ss.sale_id AS product_id,
		content.title,
		stock.name AS variant_name,
		oi.volume AS quantity,
		stock.real_price::text AS unit_price,
		(oi.volume * stock.real_price)::text AS line_total
	FROM orders o
	JOIN order_items oi ON oi.order_id = o.id
	JOIN cart_items ci ON ci.id = oi.cart_item_id
	JOIN cart_item_stocks cis ON cis.cart_item_id = ci.id
	JOIN sale_snapshots ss ON ss.id = ci.sale_snapshot_id
	LEFT JOIN order_payments payment ON payment.order_id = o.id
	LEFT JOIN LATERAL (
		SELECT pa.status
		FROM payment_attempts pa
		WHERE pa.order_id = o.id
		ORDER BY pa.created_at DESC, pa.id DESC
		LIMIT 1
	) latest_attempt ON TRUE
	JOIN LATERAL (
		SELECT title
		FROM sale_snapshot_contents content
		WHERE content.sale_snapshot_id = ci.sale_snapshot_id
		ORDER BY content.id DESC
		LIMIT 1
	) content ON TRUE
	JOIN sale_snapshot_unit_stocks stock ON stock.id = cis.sale_snapshot_unit_stock_id
	WHERE o.id = ?
	AND o.customer_id = ?
	AND o.deleted_at IS NULL
	ORDER BY oi.sequence ASC, oi.id ASC
`;

function toFixedPrice(value: string | number): string {
	return Number(value).toFixed(2);
}

function mapOrderRows(rows: readonly OrderRow[]): OrderView {
	const [firstRow] = rows;
	if (firstRow === undefined) {
		throw new NotFoundError('Order not found');
	}

	const items: OrderLine[] = rows.map(row => ({
		order_item_id: row.order_item_id,
		cart_item_id: row.cart_item_id,
		product_id: row.product_id,
		snapshot_id: row.snapshot_id,
		variant_id: row.variant_id,
		title: row.title,
		variant_name: row.variant_name,
		quantity: row.quantity,
		unit_price: toFixedPrice(row.unit_price),
		line_total: toFixedPrice(row.line_total),
	}));

	const totalAmount = items.reduce((sum, item) => sum + Number(item.line_total), 0);

	return {
		order_id: firstRow.order_id,
		customer_id: firstRow.customer_id,
		address_id: firstRow.address_id,
		status: firstRow.status,
		items,
		total_amount: toFixedPrice(totalAmount),
	};
}

@Injectable()
export class OrderRepository {
	public async loadCheckoutCart(entityManager: EntityManager, cartId: string, customerId: string): Promise<CartCheckoutRow[]> {
		return await entityManager.getConnection().execute(CHECKOUT_CART_SQL, [cartId, customerId], 'all') as unknown as CartCheckoutRow[];
	}

	public async loadOrderView(entityManager: EntityManager, orderId: string, customerId: string): Promise<OrderView> {
		const rows = await entityManager.getConnection().execute(ORDER_VIEW_SQL, [orderId, customerId], 'all') as unknown as OrderRow[];
		return mapOrderRows(rows);
	}

	public async insertOrderFromCart(entityManager: EntityManager, customerId: string, addressId: string, cartRows: readonly CartCheckoutRow[]): Promise<string> {
		const orderId = randomUUID();
		await entityManager.getConnection().execute(
			`INSERT INTO orders (id, customer_id, address_id, name, cash, deposit, mileage, created_at, deleted_at)
			 VALUES (?, ?, ?, ?, ?, '0.00', '0.00', NOW(), NULL)`,
			[
				orderId,
				customerId,
				addressId,
				`Order ${orderId.slice(0, 8)}`,
				toFixedPrice(cartRows.reduce((sum, row) => sum + Number(row.current_price) * row.quantity, 0)),
			],
			'run',
		);

		for (const [index, row] of cartRows.entries()) {
			await entityManager.getConnection().execute(
				`INSERT INTO order_items (id, order_id, cart_item_id, seller_customer_id, volume, sequence, confirmed_at)
				 VALUES (?, ?, ?, ?, ?, ?, NOW())`,
				[randomUUID(), orderId, row.cart_item_id, row.seller_customer_id, row.quantity, index + 1],
				'run',
			);
		}

		return orderId;
	}
}
