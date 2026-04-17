import type { INestApplication } from '@nestjs/common';

import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ERROR_CODES } from '../http/error-codes';
import { HttpExceptionFilter } from '../http/http-exception.filter';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://mwa:mwa@localhost:5432/mwa?schema=public';

describe('search integration behavior', () => {
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

	it('returns prefix matches before contains matches', async () => {
		const response = await request(app.getHttpServer()).get('/api/search?q=on&page=1&limit=20');

		expect(response.status).toBe(200);
		expect(response.body.meta.pagination).toEqual({
			page: 1,
			limit: 20,
			total: 2,
			totalPages: 1,
		});
		expect(response.body.data.items[0]).toMatchObject({
			title: 'On-call Tumbler',
			product_id: '77777777-7777-4777-8777-777777777775',
		});
		expect(response.body.data.items[1]).toMatchObject({
			product_id: '77777777-7777-4777-8777-777777777771',
		});
	});

	it('orders non-prefix search matches alphabetically by title', async () => {
		const response = await request(app.getHttpServer()).get('/api/search?q=er&page=1&limit=20');

		expect(response.status).toBe(200);
		expect(response.body.data.items.map((item: { title: string }) => item.title)).toEqual([
			'Alert Sticker Pack',
			'On-call Tumbler',
		]);
	});

	it('trims search queries before matching titles', async () => {
		const response = await request(app.getHttpServer()).get('/api/search?q=%20mug%20&page=1&limit=20');

		expect(response.status).toBe(200);
		expect(response.body.data.items).toHaveLength(1);
		expect(response.body.data.items[0]).toMatchObject({
			title: 'SRE Mug',
		});
	});

	it('returns validation failure for one-character queries', async () => {
		const response = await request(app.getHttpServer()).get('/api/search?q=a&page=1&limit=20');

		expect(response.status).toBe(400);
		expect(response.body).toEqual({
			success: false,
			error: {
				code: ERROR_CODES.VALIDATION_ERROR,
				message: 'Request validation failed',
				details: {
					issues: [
						{
							path: 'q',
							message: 'q must be a string with at least 2 characters',
							value: 'a',
						},
					],
				},
			},
		});
	});

	it('returns zero-result searches with empty items and correct pagination', async () => {
		const response = await request(app.getHttpServer()).get('/api/search?q=zzz&page=1&limit=20');

		expect(response.status).toBe(200);
		expect(response.body).toEqual({
			success: true,
			data: {
				items: [],
			},
			meta: {
				pagination: {
					page: 1,
					limit: 20,
					total: 0,
					totalPages: 1,
				},
			},
		});
	});
});
