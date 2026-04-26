import type { EntityManager } from '@mikro-orm/core';
import type { CartLine, CartView } from './cart.types';
import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { NotFoundError } from '../http/http-error';
import { CART_ITEM_MAX_QUANTITY } from './cart.types';

type CartRow = {
	readonly cart_id: string;
	readonly customer_id: string;
	readonly cart_item_id: string | null;
	readonly product_id: string | null;
	readonly snapshot_id: string | null;
	readonly variant_id: string | null;
	readonly title: string | null;
	readonly variant_name: string | null;
	readonly quantity: number | null;
	readonly available_quantity: number | null;
	readonly current_price: string | null;
};

export type VariantRow = {
	readonly product_id: string;
	readonly snapshot_id: string;
	readonly stored_snapshot_id: string;
	readonly variant_id: string;
	readonly title: string;
	readonly unit_id: string;
	readonly variant_name: string;
	readonly available_quantity: number;
	readonly current_price: string;
};

export type ExistingCartItemRow = {
	readonly cart_item_id: string;
	readonly quantity: number;
};

const ACTIVE_CART_WHERE_SQL = `
	c.deleted_at IS NULL
	AND c.actor_type = 'buyer'
	AND NOT EXISTS (
		SELECT 1
		FROM cart_items existing_item
		JOIN order_items ordered_item ON ordered_item.cart_item_id = existing_item.id
		WHERE existing_item.cart_id = c.id
		AND existing_item.deleted_at IS NULL
	)
`;

const CART_VIEW_SQL = `
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
			stock.real_price::text AS current_price
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
		COALESCE(current_variant_state.product_id, ss.sale_id) AS product_id,
		ci.sale_snapshot_id AS snapshot_id,
		cis.sale_snapshot_unit_stock_id AS variant_id,
		COALESCE(current_variant_state.title, content.title) AS title,
		COALESCE(current_variant_state.variant_name, stock.name) AS variant_name,
		cis.quantity,
		COALESCE(current_variant_state.available_quantity, 0) AS available_quantity,
		COALESCE(current_variant_state.current_price, stock.real_price::text) AS current_price
	FROM carts c
	LEFT JOIN cart_items ci
		ON ci.cart_id = c.id
		AND ci.deleted_at IS NULL
	LEFT JOIN cart_item_stocks cis
		ON cis.cart_item_id = ci.id
	LEFT JOIN sale_snapshots ss
		ON ss.id = ci.sale_snapshot_id
	LEFT JOIN canonical_contents content
		ON content.sale_snapshot_id = ci.sale_snapshot_id
		AND content.content_rank = 1
	LEFT JOIN sale_snapshot_unit_stocks stock
		ON stock.id = cis.sale_snapshot_unit_stock_id
	LEFT JOIN current_variant_state
		ON current_variant_state.variant_id = cis.sale_snapshot_unit_stock_id
	WHERE c.id = ?
	ORDER BY ci.created_at ASC, ci.id ASC
`;

const VARIANT_LOOKUP_SQL = `
	WITH latest_snapshots AS (
		SELECT
			ss.id,
			ss.sale_id,
			ROW_NUMBER() OVER (
				PARTITION BY ss.sale_id
				ORDER BY ss.created_at DESC, ss.id DESC
			) AS snapshot_rank
		FROM sale_snapshots ss
	),
	canonical_contents AS (
		SELECT
			content.sale_snapshot_id,
			content.title,
			ROW_NUMBER() OVER (
				PARTITION BY content.sale_snapshot_id
				ORDER BY content.id DESC
			) AS content_rank
		FROM sale_snapshot_contents content
	)
	SELECT
		ls.sale_id AS product_id,
		ls.id AS snapshot_id,
		ls.id AS stored_snapshot_id,
		stock.id AS variant_id,
		content.title,
		unit.id AS unit_id,
		stock.name AS variant_name,
		stock.quantity AS available_quantity,
		stock.real_price::text AS current_price
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
	AND stock.id = ?
	AND sale.opened_at IS NOT NULL
	AND sale.closed_at IS NULL
	AND sale.paused_at IS NULL
	AND sale.suspended_at IS NULL
`;

function mapCartRows(rows: readonly CartRow[]): CartView {
	const [firstRow] = rows;

	if (firstRow === undefined) {
		throw new Error('Cart view query returned no rows');
	}

	const items: CartLine[] = rows.flatMap((row) => {
		if (
			row.cart_item_id === null
			|| row.product_id === null
			|| row.snapshot_id === null
			|| row.variant_id === null
			|| row.title === null
			|| row.variant_name === null
			|| row.quantity === null
			|| row.available_quantity === null
			|| row.current_price === null
		) {
			return [];
		}

		return [{
			cart_item_id: row.cart_item_id,
			product_id: row.product_id,
			snapshot_id: row.snapshot_id,
			variant_id: row.variant_id,
			title: row.title,
			variant_name: row.variant_name,
			quantity: row.quantity,
			max_quantity: CART_ITEM_MAX_QUANTITY,
			available_quantity: row.available_quantity,
			is_available: row.available_quantity >= row.quantity,
			current_price: row.current_price,
		}];
	});

	return {
		cart_id: firstRow.cart_id,
		customer_id: firstRow.customer_id,
		items,
	};
}

@Injectable()
export class CartRepository {
	public async findActiveCartId(entityManager: EntityManager, customerId: string): Promise<string | null> {
		const rows = await entityManager.getConnection().execute(
			`SELECT c.id
			 FROM carts c
			 WHERE c.customer_id = ?
			 AND ${ACTIVE_CART_WHERE_SQL}
			 ORDER BY c.created_at DESC, c.id ASC
			 LIMIT 1`,
			[customerId],
			'all',
		) as unknown as Array<{ id: string }>;

		return rows[0]?.id ?? null;
	}

	public async ensureActiveCartId(entityManager: EntityManager, customerId: string): Promise<string> {
		const existingCartId = await this.findActiveCartId(entityManager, customerId);

		if (existingCartId !== null) {
			return existingCartId;
		}

		const cartId = randomUUID();
		await entityManager.getConnection().execute(
			`INSERT INTO carts (id, customer_id, actor_type, created_at, deleted_at)
			 VALUES (?, ?, 'buyer', NOW(), NULL)`,
			[cartId, customerId],
			'run',
		);

		return cartId;
	}

	public async loadVariant(entityManager: EntityManager, variantId: string): Promise<VariantRow> {
		const rows = await entityManager.getConnection().execute(
			VARIANT_LOOKUP_SQL,
			[variantId],
			'all',
		) as unknown as VariantRow[];

		const [variant] = rows;
		if (variant === undefined) {
			throw new NotFoundError('Cart variant not found');
		}

		return variant;
	}

	public async loadCartView(entityManager: EntityManager, cartId: string): Promise<CartView> {
		const rows = await entityManager.getConnection().execute(CART_VIEW_SQL, [cartId], 'all') as unknown as CartRow[];
		return mapCartRows(rows);
	}

	public async findItemByVariant(entityManager: EntityManager, cartId: string, variantId: string): Promise<ExistingCartItemRow | undefined> {
		const existingRows = await entityManager.getConnection().execute(
			`SELECT ci.id AS cart_item_id, cis.quantity
			 FROM cart_items ci
			 JOIN cart_item_stocks cis ON cis.cart_item_id = ci.id
			 WHERE ci.cart_id = ?
			 AND ci.deleted_at IS NULL
			 AND cis.sale_snapshot_unit_stock_id = ?`,
			[cartId, variantId],
			'all',
		) as unknown as ExistingCartItemRow[];

		return existingRows[0];
	}

	public async updateItemQuantity(entityManager: EntityManager, cartItemId: string, quantity: number): Promise<void> {
		await entityManager.getConnection().execute(
			`UPDATE cart_items SET volume = ? WHERE id = ?`,
			[quantity, cartItemId],
			'run',
		);
		await entityManager.getConnection().execute(
			`UPDATE cart_item_stocks SET quantity = ? WHERE cart_item_id = ?`,
			[quantity, cartItemId],
			'run',
		);
	}

	public async insertItem(entityManager: EntityManager, cartId: string, variant: VariantRow, quantity: number): Promise<void> {
		const cartItemId = randomUUID();
		const cartItemStockId = randomUUID();

		await entityManager.getConnection().execute(
			`INSERT INTO cart_items (id, cart_id, sale_snapshot_id, volume, published, created_at, deleted_at)
			 VALUES (?, ?, ?, ?, true, NOW(), NULL)`,
			[cartItemId, cartId, variant.snapshot_id, quantity],
			'run',
		);
		await entityManager.getConnection().execute(
			`INSERT INTO cart_item_stocks (id, cart_item_id, sale_snapshot_unit_id, sale_snapshot_unit_stock_id, quantity, sequence)
			 VALUES (?, ?, ?, ?, ?, 1)`,
			[cartItemStockId, cartItemId, variant.unit_id, variant.variant_id, quantity],
			'run',
		);
	}

	public async deleteItem(entityManager: EntityManager, cartItemId: string): Promise<void> {
		await entityManager.getConnection().execute(
			`DELETE FROM cart_item_stock_choices WHERE cart_item_stock_id IN (
				SELECT id FROM cart_item_stocks WHERE cart_item_id = ?
			)`,
			[cartItemId],
			'run',
		);
		await entityManager.getConnection().execute(`DELETE FROM cart_item_stocks WHERE cart_item_id = ?`, [cartItemId], 'run');
		await entityManager.getConnection().execute(`DELETE FROM cart_items WHERE id = ?`, [cartItemId], 'run');
	}
}
