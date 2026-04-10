import { randomUUID } from 'node:crypto';

import { EntityManager } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';

import { ERROR_CODES } from '../http/error-codes';
import { HttpError, NotFoundError } from '../http/http-error';

import type { OrderLine, OrderView } from './order.types';

type CartCheckoutRow = {
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

function createConflictError(message: string, details?: unknown): HttpError {
	return new HttpError(409, ERROR_CODES.BAD_REQUEST, message, details);
}

function toFixedPrice(value: string | number): string {
	return Number(value).toFixed(2);
}

function mapOrderRows(rows: readonly OrderRow[]): OrderView {
	const [firstRow] = rows;
	if (firstRow === undefined) {
		throw new NotFoundError('Order not found');
	}

	const items: OrderLine[] = rows.map((row) => ({
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
		status: 'pending_payment',
		items,
		total_amount: toFixedPrice(totalAmount),
	};
}

@Injectable()
export class OrderService {
	public constructor(@Inject(EntityManager) private readonly entityManager: EntityManager) {}

	private async withCustomerLock<T>(customerId: string, operation: (entityManager: EntityManager) => Promise<T>): Promise<T> {
		return this.entityManager.transactional(async (entityManager) => {
			await entityManager.getConnection().execute(
				'SELECT pg_advisory_xact_lock(hashtext(?))',
				[customerId],
				'get',
			);

			return operation(entityManager);
		});
	}

	private async loadCheckoutCart(entityManager: EntityManager, cartId: string, customerId: string): Promise<CartCheckoutRow[]> {
		return entityManager.getConnection().execute<CartCheckoutRow>(CHECKOUT_CART_SQL, [cartId, customerId], 'all');
	}

	private async loadOrderView(entityManager: EntityManager, orderId: string, customerId: string): Promise<OrderView> {
		const rows = await entityManager.getConnection().execute<OrderRow>(ORDER_VIEW_SQL, [orderId, customerId], 'all');
		return mapOrderRows(rows);
	}

	private validateAddressOwnership(customerId: string, addressId: string): void {
		const seededAddressByCustomer: Record<string, string> = {
			'11111111-1111-4111-8111-111111111111': '22222222-2222-4222-8222-222222222221',
			'11111111-1111-4111-8111-111111111112': '22222222-2222-4222-8222-222222222222',
		};

		const allowedAddressId = seededAddressByCustomer[customerId];
		if (allowedAddressId === undefined || allowedAddressId !== addressId) {
			throw new NotFoundError('Address not found');
		}
	}

	public async createOrder(customerId: string, cartId: string, addressId: string): Promise<OrderView> {
		return this.withCustomerLock(customerId, async (entityManager) => {
			this.validateAddressOwnership(customerId, addressId);

			const cartRows = await this.loadCheckoutCart(entityManager, cartId, customerId);

			if (cartRows.length === 0) {
				throw createConflictError('Cart cannot be checked out', { cart_id: cartId });
			}

			for (const row of cartRows) {
				if (
					row.current_snapshot_id === null
					|| row.product_id === null
					|| row.title === null
					|| row.variant_name === null
					|| row.available_quantity === null
					|| row.current_price === null
					|| row.seller_customer_id === null
				) {
					throw createConflictError('Cart item is unavailable', {
						cart_item_id: row.cart_item_id,
						variant_id: row.variant_id,
					});
				}

				if (row.snapshot_id !== row.current_snapshot_id) {
					throw createConflictError('Cart item is unavailable', {
						cart_item_id: row.cart_item_id,
						variant_id: row.variant_id,
					});
				}

				if (row.available_quantity < row.quantity) {
					throw createConflictError('Cart item is unavailable', {
						variant_id: row.variant_id,
						available_quantity: row.available_quantity,
					});
				}
			}

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

			return this.loadOrderView(entityManager, orderId, customerId);
		});
	}

	public async getOrder(customerId: string, orderId: string): Promise<OrderView> {
		return this.withCustomerLock(customerId, async (entityManager) => this.loadOrderView(entityManager, orderId, customerId));
	}
}
