import type { INestApplication } from '@nestjs/common';

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import { EntityManager } from '@mikro-orm/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ERROR_CODES } from '../http/error-codes';
import { HttpExceptionFilter } from '../http/http-exception.filter';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://mwa:mwa@localhost:5432/mwa?schema=public';
const BUYER_ONE = '11111111-1111-4111-8111-111111111111';
const BUYER_TWO = '11111111-1111-4111-8111-111111111112';
const ADDRESS_ONE = '22222222-2222-4222-8222-222222222221';
const NOTEBOOK_VARIANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

type TestCart = {
	cartId: string;
	cartItemId: string;
};

function resetDatabase(): void {
	execFileSync('npm', ['run', 'db:reset:test'], {
		cwd: process.cwd(),
		env: {
			...process.env,
			DATABASE_URL,
		},
		stdio: 'pipe',
	})
}

describe('order integration behavior', () => {
	let app: INestApplication;
	let entityManager: EntityManager;
	let checkoutCart: TestCart;
	let emptyCart: TestCart;
	let staleSnapshotId: string;
	let staleContentId: string;
	let staleUnitId: string;
	let staleStockId: string;

	beforeAll(async () => {
		resetDatabase();
		process.env.DATABASE_URL = DATABASE_URL;

		const { AppModule } = await import('../app.module');

		const testingModule = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		app = testingModule.createNestApplication();
		app.useGlobalFilters(new HttpExceptionFilter());
		await app.init();
		entityManager = app.get(EntityManager);
	});

	beforeEach(async () => {
		checkoutCart = { cartId: randomUUID(), cartItemId: randomUUID() };
		emptyCart = { cartId: randomUUID(), cartItemId: randomUUID() };
		staleSnapshotId = randomUUID();
		staleContentId = randomUUID();
		staleUnitId = randomUUID();
		staleStockId = randomUUID();

		await entityManager.getConnection().execute(
			`INSERT INTO carts (id, customer_id, actor_type, created_at, deleted_at)
			 VALUES (?, ?, 'buyer', NOW(), NULL)`,
			[checkoutCart.cartId, BUYER_ONE],
			'run',
		);
		await entityManager.getConnection().execute(
			`INSERT INTO cart_items (id, cart_id, sale_snapshot_id, volume, published, created_at, deleted_at)
			 VALUES (?, ?, ?, 1, true, NOW(), NULL)`,
			[checkoutCart.cartItemId, checkoutCart.cartId, '88888888-8888-4888-8888-888888888881'],
			'run',
		);
		await entityManager.getConnection().execute(
			`INSERT INTO cart_item_stocks (id, cart_item_id, sale_snapshot_unit_id, sale_snapshot_unit_stock_id, quantity, sequence)
			 VALUES (?, ?, ?, ?, 1, 1)`,
			[randomUUID(), checkoutCart.cartItemId, '99999999-9999-4999-8999-999999999991', NOTEBOOK_VARIANT],
			'run',
		);
		await entityManager.getConnection().execute(
			`INSERT INTO carts (id, customer_id, actor_type, created_at, deleted_at)
			 VALUES (?, ?, 'buyer', NOW(), NULL)`,
			[emptyCart.cartId, BUYER_TWO],
			'run',
		);
	});

	afterEach(() => {
		resetDatabase();
	});

	afterAll(async () => {
		if (app !== undefined) {
			await app.close();
		}
	});

	it('creates one pending-payment order from a non-empty cart and empties the cart', async () => {
		const response = await request(app.getHttpServer())
			.post('/api/orders')
			.set('x-customer-id', BUYER_ONE)
			.send({
				cartId: checkoutCart.cartId,
				addressId: ADDRESS_ONE,
			});

		expect(response.status).toBe(201);
		expect(response.body.data.order).toMatchObject({
			customer_id: BUYER_ONE,
			address_id: ADDRESS_ONE,
			status: 'pending_payment',
			total_amount: '9900.00',
			items: [
				{
					cart_item_id: checkoutCart.cartItemId,
					variant_id: NOTEBOOK_VARIANT,
					quantity: 1,
					unit_price: '9900.00',
					line_total: '9900.00',
				},
			],
		});

	});

	it('returns the created order only to the same customer', async () => {
		const created = await request(app.getHttpServer())
			.post('/api/orders')
			.set('x-customer-id', BUYER_ONE)
			.send({
				cartId: checkoutCart.cartId,
				addressId: ADDRESS_ONE,
			});

		const orderId = created.body.data.order.order_id;

		const sameCustomer = await request(app.getHttpServer())
			.get(`/api/orders/${orderId}`)
			.set('x-customer-id', BUYER_ONE);

		expect(sameCustomer.status).toBe(200);

		const differentCustomer = await request(app.getHttpServer())
			.get(`/api/orders/${orderId}`)
			.set('x-customer-id', BUYER_TWO);

		expect(differentCustomer.status).toBe(404);
		expect(differentCustomer.body.error.code).toBe(ERROR_CODES.NOT_FOUND);
	});

	it('returns not found when a buyer uses another buyer\'s address', async () => {
		const response = await request(app.getHttpServer())
			.post('/api/orders')
			.set('x-customer-id', BUYER_ONE)
			.send({
				cartId: checkoutCart.cartId,
				addressId: '22222222-2222-4222-8222-222222222222',
			});

		expect(response.status).toBe(404);
		expect(response.body.error.code).toBe(ERROR_CODES.NOT_FOUND);
	});

	it('returns conflict for empty-cart checkout and creates no order rows', async () => {
		const beforeCount = await entityManager.getConnection().execute<{ count: string }>(
			'SELECT COUNT(*)::text AS count FROM orders',
			[],
			'all',
		);

		const response = await request(app.getHttpServer())
			.post('/api/orders')
			.set('x-customer-id', BUYER_TWO)
			.send({
				cartId: emptyCart.cartId,
				addressId: '22222222-2222-4222-8222-222222222222',
			});

		expect(response.status).toBe(409);
		expect(response.body.error.code).toBe(ERROR_CODES.STATE_CONFLICT);

		const afterCount = await entityManager.getConnection().execute<{ count: string }>(
			'SELECT COUNT(*)::text AS count FROM orders',
			[],
			'all',
		);

		expect(afterCount[0].count).toBe(beforeCount[0].count);
	});

	it('rolls back when current variant availability no longer satisfies cart quantity', async () => {
		await entityManager.getConnection().execute(
			'UPDATE sale_snapshot_unit_stocks SET quantity = 0 WHERE id = ?',
			[NOTEBOOK_VARIANT],
			'run',
		);

		const response = await request(app.getHttpServer())
			.post('/api/orders')
			.set('x-customer-id', BUYER_ONE)
			.send({
				cartId: checkoutCart.cartId,
				addressId: ADDRESS_ONE,
			});

		expect(response.status).toBe(409);
		expect(response.body.error.code).toBe(ERROR_CODES.STATE_CONFLICT);

		const cartAfter = await request(app.getHttpServer())
			.get('/api/cart')
			.set('x-customer-id', BUYER_ONE);

		expect(cartAfter.body.data.cart.items).toHaveLength(1);
		await entityManager.getConnection().execute(
			'UPDATE sale_snapshot_unit_stocks SET quantity = 50 WHERE id = ?',
			[NOTEBOOK_VARIANT],
			'run',
		);
	});

	it('rolls back when a mixed cart contains one stale line', async () => {
		const secondCartItemId = randomUUID();
		await entityManager.getConnection().execute(
			`INSERT INTO cart_items (id, cart_id, sale_snapshot_id, volume, published, created_at, deleted_at)
			 VALUES (?, ?, ?, 1, true, NOW(), NULL)`,
			[secondCartItemId, checkoutCart.cartId, '88888888-8888-4888-8888-888888888882'],
			'run',
		);
		await entityManager.getConnection().execute(
			`INSERT INTO cart_item_stocks (id, cart_item_id, sale_snapshot_unit_id, sale_snapshot_unit_stock_id, quantity, sequence)
			 VALUES (?, ?, ?, ?, 1, 1)`,
			[randomUUID(), secondCartItemId, '99999999-9999-4999-8999-999999999992', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'],
			'run',
		);

		await entityManager.getConnection().execute(
			`INSERT INTO sale_snapshots (id, sale_id) VALUES (?, '77777777-7777-4777-8777-777777777772')`,
			[staleSnapshotId],
			'run',
		);
		await entityManager.getConnection().execute(
			`INSERT INTO sale_snapshot_contents (id, sale_snapshot_id, title, format, body, revert_policy)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			[staleContentId, staleSnapshotId, 'SRE Mug v2', 'markdown', 'Updated mug snapshot', 'manual'],
			'run',
		);
		await entityManager.getConnection().execute(
			`INSERT INTO sale_snapshot_units (id, sale_snapshot_id, name, "primary", required, sequence)
			 VALUES (?, ?, 'variant', TRUE, TRUE, 1)`,
			[staleUnitId, staleSnapshotId],
			'run',
		);
		await entityManager.getConnection().execute(
			`INSERT INTO sale_snapshot_unit_stocks (id, sale_snapshot_unit_id, name, nominal_price, real_price, quantity, sequence)
			 VALUES (?, ?, 'Standard', '19000.00', '15900.00', 50, 1)`,
			[staleStockId, staleUnitId],
			'run',
		);

		const beforeCount = await entityManager.getConnection().execute<{ count: string }>(
			'SELECT COUNT(*)::text AS count FROM orders',
			[],
			'all',
		);

		const response = await request(app.getHttpServer())
			.post('/api/orders')
			.set('x-customer-id', BUYER_ONE)
			.send({
				cartId: checkoutCart.cartId,
				addressId: ADDRESS_ONE,
			});

		expect(response.status).toBe(409);
		expect(response.body.error.code).toBe(ERROR_CODES.STATE_CONFLICT);

		const afterCount = await entityManager.getConnection().execute<{ count: string }>(
			'SELECT COUNT(*)::text AS count FROM orders',
			[],
			'all',
		);
		const cartAfter = await request(app.getHttpServer())
			.get('/api/cart')
			.set('x-customer-id', BUYER_ONE);

		expect(afterCount[0].count).toBe(beforeCount[0].count);
		expect(cartAfter.body.data.cart.items).toHaveLength(2);
	});

	it('returns conflict when posting the same cart again after checkout consumed it', async () => {
		const created = await request(app.getHttpServer())
			.post('/api/orders')
			.set('x-customer-id', BUYER_ONE)
			.send({
				cartId: checkoutCart.cartId,
				addressId: ADDRESS_ONE,
			});

		expect(created.status).toBe(201);

		const replay = await request(app.getHttpServer())
			.post('/api/orders')
			.set('x-customer-id', BUYER_ONE)
			.send({
				cartId: checkoutCart.cartId,
				addressId: ADDRESS_ONE,
			});

		expect(replay.status).toBe(409);
		expect(replay.body.error.code).toBe(ERROR_CODES.STATE_CONFLICT);
	});

	it('rolls back when the latest snapshot price changes even if stock remains available', async () => {
		await entityManager.getConnection().execute(
			`INSERT INTO sale_snapshots (id, sale_id) VALUES (?, '77777777-7777-4777-8777-777777777771')`,
			[staleSnapshotId],
			'run',
		);
		await entityManager.getConnection().execute(
			`INSERT INTO sale_snapshot_contents (id, sale_snapshot_id, title, format, body, revert_policy)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			[staleContentId, staleSnapshotId, 'Monitoring Notebook', 'markdown', 'Price changed snapshot', 'manual'],
			'run',
		);
		await entityManager.getConnection().execute(
			`INSERT INTO sale_snapshot_units (id, sale_snapshot_id, name, "primary", required, sequence)
			 VALUES (?, ?, 'variant', TRUE, TRUE, 1)`,
			[staleUnitId, staleSnapshotId],
			'run',
		);
		await entityManager.getConnection().execute(
			`INSERT INTO sale_snapshot_unit_stocks (id, sale_snapshot_unit_id, name, nominal_price, real_price, quantity, sequence)
			 VALUES (?, ?, 'Standard', '12900.00', '11900.00', 50, 1)`,
			[staleStockId, staleUnitId],
			'run',
		);

		const response = await request(app.getHttpServer())
			.post('/api/orders')
			.set('x-customer-id', BUYER_ONE)
			.send({
				cartId: checkoutCart.cartId,
				addressId: ADDRESS_ONE,
			});

		expect(response.status).toBe(409);
		expect(response.body.error.code).toBe(ERROR_CODES.STATE_CONFLICT);
	});

	it('rolls back when a cart line variant disappears from the current active snapshot', async () => {
		await entityManager.getConnection().execute(
			`INSERT INTO sale_snapshots (id, sale_id) VALUES (?, '77777777-7777-4777-8777-777777777771')`,
			[staleSnapshotId],
			'run',
		);
		await entityManager.getConnection().execute(
			`INSERT INTO sale_snapshot_contents (id, sale_snapshot_id, title, format, body, revert_policy)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			[staleContentId, staleSnapshotId, 'Monitoring Notebook', 'markdown', 'Variant removed snapshot', 'manual'],
			'run',
		);
		await entityManager.getConnection().execute(
			`INSERT INTO sale_snapshot_units (id, sale_snapshot_id, name, "primary", required, sequence)
			 VALUES (?, ?, 'variant', TRUE, TRUE, 1)`,
			[staleUnitId, staleSnapshotId],
			'run',
		);
		await entityManager.getConnection().execute(
			`INSERT INTO sale_snapshot_unit_stocks (id, sale_snapshot_unit_id, name, nominal_price, real_price, quantity, sequence)
			 VALUES (?, ?, 'Large', '10900.00', '9900.00', 50, 1)`,
			[staleStockId, staleUnitId],
			'run',
		);

		const response = await request(app.getHttpServer())
			.post('/api/orders')
			.set('x-customer-id', BUYER_ONE)
			.send({
				cartId: checkoutCart.cartId,
				addressId: ADDRESS_ONE,
			});

		expect(response.status).toBe(409);
		expect(response.body.error.code).toBe(ERROR_CODES.STATE_CONFLICT);
	});
});
