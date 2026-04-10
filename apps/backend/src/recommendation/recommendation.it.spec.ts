import type { INestApplication } from '@nestjs/common';

import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ERROR_CODES } from '../http/error-codes';
import { HttpExceptionFilter } from '../http/http-exception.filter';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://mwa:mwa@localhost:5432/mwa?schema=public';

const FIXTURE_IDS = {
	sales: {
		notebook: '77777777-7777-4777-8777-777777777771',
		mug: '77777777-7777-4777-8777-777777777772',
		sticker: '77777777-7777-4777-8777-777777777773',
		keyboard: '77777777-7777-4777-8777-777777777774',
		tumbler: '77777777-7777-4777-8777-777777777775',
		hoodie: '77777777-7777-4777-8777-777777777776',
	},
} as const;

describe('recommendation integration behavior', () => {
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

	it('returns deterministic placeholder recommendations excluding the source product', async () => {
		const response = await request(app.getHttpServer()).get(
			`/api/catalog/products/${FIXTURE_IDS.sales.notebook}/recommendations?limit=4`,
		);

		expect(response.status).toBe(200);
		expect(response.body.data.items).toHaveLength(4);
		expect(response.body.data.items.map((item: { product_id: string }) => item.product_id)).toEqual([
			FIXTURE_IDS.sales.mug,
			FIXTURE_IDS.sales.sticker,
			FIXTURE_IDS.sales.keyboard,
			FIXTURE_IDS.sales.tumbler,
		]);
	});

	it('supports smaller recommendation limits', async () => {
		const response = await request(app.getHttpServer()).get(
			`/api/catalog/products/${FIXTURE_IDS.sales.notebook}/recommendations?limit=2`,
		);

		expect(response.status).toBe(200);
		expect(response.body.data.items).toHaveLength(2);
	});

	it('returns validation failure for invalid recommendation limits', async () => {
		const response = await request(app.getHttpServer()).get(
			`/api/catalog/products/${FIXTURE_IDS.sales.notebook}/recommendations?limit=5`,
		);

		expect(response.status).toBe(400);
		expect(response.body).toEqual({
			success: false,
			error: {
				code: ERROR_CODES.VALIDATION_ERROR,
				message: 'Request validation failed',
				details: {
					issues: [
						{
							path: 'limit',
							message: 'limit must be an integer between 1 and 4',
							value: '5',
						},
					],
				},
			},
		});
	});

	it('returns not found for unknown source products', async () => {
		const response = await request(app.getHttpServer()).get(
			'/api/catalog/products/00000000-0000-4000-8000-000000000009/recommendations?limit=4',
		);

		expect(response.status).toBe(404);
		expect(response.body).toEqual({
			success: false,
			error: {
				code: ERROR_CODES.NOT_FOUND,
				message: 'Catalog product not found',
			},
		});
	});
});
