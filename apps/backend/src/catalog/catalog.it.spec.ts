import type { INestApplication } from '@nestjs/common';

import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ERROR_CODES } from '../http/error-codes';
import { HttpExceptionFilter } from '../http/http-exception.filter';

const FIXTURE_IDS = {
	sales: {
		notebook: '77777777-7777-4777-8777-777777777771',
		mug: '77777777-7777-4777-8777-777777777772',
		sticker: '77777777-7777-4777-8777-777777777773',
	},
	saleSnapshots: {
		notebook: '88888888-8888-4888-8888-888888888881',
		mug: '88888888-8888-4888-8888-888888888882',
	},
	variantStocks: {
		notebook: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		mug: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
	},
} as const;

const BACKEND_DIRECTORY = path.resolve(__dirname, '../..');
const DATABASE_URL = 'postgresql://mwa:mwa@localhost:5432/mwa?schema=public';

function runBackendCommand(command: string): void {
	execFileSync('npm', ['run', command], {
		cwd: BACKEND_DIRECTORY,
		env: {
			...process.env,
			DATABASE_URL,
		},
		stdio: 'pipe',
	});
}

describe('catalog integration behavior', () => {
	let app: INestApplication;

	beforeAll(async () => {
		process.env.DATABASE_URL = DATABASE_URL;
		runBackendCommand('db:reset:test');
		runBackendCommand('db:seed');

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

	it('returns paginated catalog products with newest sorting by default', async () => {
		const response = await request(app.getHttpServer()).get('/api/catalog/products?page=1&limit=2');

		expect(response.status).toBe(200);
		expect(response.body.meta.pagination).toEqual({
			page: 1,
			limit: 2,
			total: 6,
			totalPages: 3,
		});
		expect(response.body.data.items).toHaveLength(2);
		expect(response.body.data.items[0]).toMatchObject({
			product_id: FIXTURE_IDS.sales.notebook,
			snapshot_id: FIXTURE_IDS.saleSnapshots.notebook,
			title: 'Monitoring Notebook',
			stock_summary: {
				total_quantity: 50,
				is_available: true,
			},
			variant_summaries: [
				{
					variant_id: FIXTURE_IDS.variantStocks.notebook,
					is_available: true,
				},
			],
		});
	});

	it('sorts catalog products by current price ascending', async () => {
		const response = await request(app.getHttpServer()).get('/api/catalog/products?sort=price_asc');

		expect(response.status).toBe(200);
		expect(response.body.data.items[0]).toMatchObject({
			product_id: FIXTURE_IDS.sales.sticker,
			title: 'Alert Sticker Pack',
			price_summary: {
				lowest_current_price: '5900.00',
			},
		});
	});

	it('returns a single catalog product by product id', async () => {
		const response = await request(app.getHttpServer()).get(
			`/api/catalog/products/${FIXTURE_IDS.sales.mug}`,
		);

		expect(response.status).toBe(200);
		expect(response.body.data.product).toMatchObject({
			product_id: FIXTURE_IDS.sales.mug,
			snapshot_id: FIXTURE_IDS.saleSnapshots.mug,
			title: 'SRE Mug',
			snapshot_content: {
				format: 'markdown',
				body: 'Seeded fixture for prod-mug',
				revert_policy: 'manual',
			},
			variant_summaries: [
				{
					variant_id: FIXTURE_IDS.variantStocks.mug,
					variant_name: 'Standard',
					is_available: true,
				},
			],
		});
	});

	it('returns not found for an unknown catalog product id', async () => {
		const response = await request(app.getHttpServer()).get(
			'/api/catalog/products/00000000-0000-4000-8000-000000000009',
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
