import type { INestApplication } from '@nestjs/common';

import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ERROR_CODES } from '../http/error-codes';
import { HttpExceptionFilter } from '../http/http-exception.filter';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://mwa:mwa@localhost:5432/mwa?schema=public';
const BUYER_ONE = '11111111-1111-4111-8111-111111111111';
const BUYER_TWO = '11111111-1111-4111-8111-111111111112';
const NOTEBOOK_VARIANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const MUG_VARIANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';

describe('cart integration behavior', () => {
	let app: INestApplication;

	beforeAll(async () => {
		process.env.DATABASE_URL = DATABASE_URL;

		const { AppModule } = await import('../app.module');

		const testingModule = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		app = testingModule.createNestApplication();
		app.useGlobalFilters(new HttpExceptionFilter());
		await app.init();
	});

	afterAll(async () => {
		if (app !== undefined) {
			await app.close();
		}
	});

	it('returns the active cart for the buyer and lazily creates one when absent', async () => {
		const existingCart = await request(app.getHttpServer())
			.get('/api/cart')
			.set('x-customer-id', BUYER_ONE);

		expect(existingCart.status).toBe(200);
		expect(existingCart.body.data.cart.items).toHaveLength(1);

		const lazyCreatedCart = await request(app.getHttpServer())
			.get('/api/cart')
			.set('x-customer-id', BUYER_TWO);

		expect(lazyCreatedCart.status).toBe(200);
		expect(lazyCreatedCart.body.data.cart.items).toEqual([]);
	});

	it('creates or increments a cart line for the same variant', async () => {
		const response = await request(app.getHttpServer())
			.post('/api/cart/items')
			.set('x-customer-id', BUYER_ONE)
			.send({ variantId: NOTEBOOK_VARIANT, quantity: 1 });

		expect(response.status).toBe(201);
		expect(response.body.data.cart.items).toHaveLength(1);
		expect(response.body.data.cart.items[0]).toMatchObject({
			variant_id: NOTEBOOK_VARIANT,
			quantity: 2,
			max_quantity: 20,
		});
	});

	it('rejects quantities below 1 and above 20', async () => {
		const getCart = await request(app.getHttpServer())
			.get('/api/cart')
			.set('x-customer-id', BUYER_ONE);

		const cartItemId = getCart.body.data.cart.items[0].cart_item_id;

		const tooLow = await request(app.getHttpServer())
			.patch(`/api/cart/items/${cartItemId}`)
			.set('x-customer-id', BUYER_ONE)
			.send({ quantity: 0 });

		expect(tooLow.status).toBe(400);
		expect(tooLow.body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);

		const tooHigh = await request(app.getHttpServer())
			.patch(`/api/cart/items/${cartItemId}`)
			.set('x-customer-id', BUYER_ONE)
			.send({ quantity: 21 });

		expect(tooHigh.status).toBe(400);
		expect(tooHigh.body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
	});

	it('deletes a cart line and leaves the cart consistent', async () => {
		const created = await request(app.getHttpServer())
			.post('/api/cart/items')
			.set('x-customer-id', BUYER_TWO)
			.send({ variantId: MUG_VARIANT, quantity: 1 });

		const cartItemId = created.body.data.cart.items[0].cart_item_id;

		const removed = await request(app.getHttpServer())
			.delete(`/api/cart/items/${cartItemId}`)
			.set('x-customer-id', BUYER_TWO);

		expect(removed.status).toBe(200);
		expect(removed.body.data.cart.items).toEqual([]);
	});
});
