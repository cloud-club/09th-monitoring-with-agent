import type { INestApplication } from '@nestjs/common';

import { execFileSync } from 'node:child_process';

import { EntityManager } from '@mikro-orm/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { HttpExceptionFilter } from '../http/http-exception.filter';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://mwa:mwa@localhost:5432/mwa?schema=public';
const BUYER_ONE = '11111111-1111-4111-8111-111111111111';
const BUYER_TWO = '11111111-1111-4111-8111-111111111112';
const ADDRESS_ONE = '22222222-2222-4222-8222-222222222221';
const NOTEBOOK_VARIANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const ORDER_SUCCESS = '55555555-5555-4555-8555-555555555551';
const ORDER_FAILURE = '55555555-5555-4555-8555-555555555552';

type MetricLabels = Record<string, string>;

function resetDatabase(): void {
	execFileSync('npm', ['run', 'db:reset:test'], {
		cwd: process.cwd(),
		env: {
			...process.env,
			DATABASE_URL,
		},
		stdio: 'pipe',
	});
}

function parseMetricLabels(rawLabels: string): MetricLabels {
	return rawLabels.split(',').reduce<MetricLabels>((accumulator, entry) => {
		const separatorIndex = entry.indexOf('=');
		if (separatorIndex === -1) {
			return accumulator;
		}

		const key = entry.slice(0, separatorIndex).trim();
		const rawValue = entry.slice(separatorIndex + 1).trim();
		accumulator[key] = rawValue.slice(1, -1);
		return accumulator;
	}, {});
}

function getMetricValue(metricsText: string, metricName: string, labels: MetricLabels): number {
	const lines = metricsText.split('\n');

	for (const line of lines) {
		if (!line.startsWith(`${metricName}{`)) {
			continue;
		}

		const labelsEnd = line.indexOf('}');
		if (labelsEnd === -1) {
			continue;
		}

		const parsedLabels = parseMetricLabels(line.slice(metricName.length + 1, labelsEnd));
		const matches = Object.entries(labels).every(([key, value]) => parsedLabels[key] === value);
		if (!matches) {
			continue;
		}

		const valueText = line.slice(labelsEnd + 1).trim();
		return Number(valueText);
	}

	return 0;
}

function assertNoForbiddenMetricLabels(metricsText: string, metricName: string): void {
	expect(metricsText).not.toMatch(new RegExp(`${metricName}\\{[^\\n]*product_id=`));
	expect(metricsText).not.toMatch(new RegExp(`${metricName}\\{[^\\n]*cart_id=`));
	expect(metricsText).not.toMatch(new RegExp(`${metricName}\\{[^\\n]*order_id=`));
	expect(metricsText).not.toMatch(new RegExp(`${metricName}\\{[^\\n]*payment_id=`));
}

describe('metrics integration behavior', () => {
	let app: INestApplication;
	let entityManager: EntityManager;

	beforeEach(async () => {
		resetDatabase();
		process.env.DATABASE_URL = DATABASE_URL;

		const { AppModule } = await import('../app.module');
		const testingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();

		app = testingModule.createNestApplication();
		app.useGlobalFilters(new HttpExceptionFilter());
		await app.init();
		entityManager = app.get(EntityManager);
	});

	afterEach(async () => {
		if (app !== undefined) {
			await app.close();
		}
	});

	it('exposes required metric names and keeps labels low-cardinality', async () => {
		await request(app.getHttpServer()).get('/health');
		await request(app.getHttpServer())
			.post(`/api/orders/${ORDER_SUCCESS}/payment-attempts`)
			.set('x-customer-id', BUYER_ONE)
			.send({ requestKey: 'req-handler-001', outcome: 'success' });

		const response = await request(app.getHttpServer()).get('/metrics');

		expect(response.status).toBe(200);
		expect(response.text).toContain('mwa_http_requests_total');
		expect(response.text).toContain('mwa_http_request_duration_seconds');
		expect(response.text).toContain('mwa_search_requests_total');
		expect(response.text).toContain('mwa_cart_add_total');
		expect(response.text).toContain('mwa_order_create_total');
		expect(response.text).toContain('mwa_payment_attempt_total');
		expect(response.text).toContain('mwa_log_heartbeat_unixtime_seconds');
		expect(response.text).toContain('mwa_payment_processing_latency_seconds');
		expect(response.text).toMatch(/mwa_http_requests_total\{[^\n]*service="backend"[^\n]*handler="\/health"[^\n]*method="GET"[^\n]*status_code="200"/);
		expect(response.text).toMatch(/mwa_http_requests_total\{[^\n]*handler="\/api\/orders\/:orderId\/payment-attempts"[^\n]*method="POST"/);
		expect(response.text).toMatch(/mwa_log_heartbeat_unixtime_seconds\{[^\n]*service="backend"[^\n]*\}\s+[0-9.]+/);
		expect(response.text).not.toContain(`/api/orders/${ORDER_SUCCESS}/payment-attempts`);

		assertNoForbiddenMetricLabels(response.text, 'mwa_http_requests_total');
		assertNoForbiddenMetricLabels(response.text, 'mwa_http_request_duration_seconds_bucket');
		assertNoForbiddenMetricLabels(response.text, 'mwa_search_requests_total');
		assertNoForbiddenMetricLabels(response.text, 'mwa_cart_add_total');
		assertNoForbiddenMetricLabels(response.text, 'mwa_order_create_total');
		assertNoForbiddenMetricLabels(response.text, 'mwa_payment_attempt_total');
		assertNoForbiddenMetricLabels(response.text, 'mwa_log_heartbeat_unixtime_seconds');
		assertNoForbiddenMetricLabels(response.text, 'mwa_payment_processing_latency_seconds_bucket');
	});

	it('increments search request counters by result', async () => {
		const before = await request(app.getHttpServer()).get('/metrics');

		await request(app.getHttpServer()).get('/api/search?q=on&page=1&limit=20');
		await request(app.getHttpServer()).get('/api/search?q=zzz&page=1&limit=20');
		await request(app.getHttpServer()).get('/api/search?q=a&page=1&limit=20');

		const after = await request(app.getHttpServer()).get('/metrics');

		expect(
			getMetricValue(after.text, 'mwa_search_requests_total', { result: 'success' })
			- getMetricValue(before.text, 'mwa_search_requests_total', { result: 'success' }),
		).toBe(1);
		expect(
			getMetricValue(after.text, 'mwa_search_requests_total', { result: 'zero_result' })
			- getMetricValue(before.text, 'mwa_search_requests_total', { result: 'zero_result' }),
		).toBe(1);
		expect(
			getMetricValue(after.text, 'mwa_search_requests_total', { result: 'validation_error' })
			- getMetricValue(before.text, 'mwa_search_requests_total', { result: 'validation_error' }),
		).toBe(1);
	});

	it('increments cart, order, and payment counters by result', async () => {
		const before = await request(app.getHttpServer()).get('/metrics');

		await request(app.getHttpServer())
			.post('/api/cart/items')
			.set('x-customer-id', BUYER_ONE)
			.send({ variantId: NOTEBOOK_VARIANT, quantity: 1 });

		await request(app.getHttpServer())
			.post('/api/cart/items')
			.set('x-customer-id', BUYER_ONE)
			.send({ variantId: NOTEBOOK_VARIANT, quantity: 0 });

		const cartResponse = await request(app.getHttpServer())
			.get('/api/cart')
			.set('x-customer-id', BUYER_ONE);

		const cartId = cartResponse.body.data.cart.cart_id;

		await request(app.getHttpServer())
			.post('/api/orders')
			.set('x-customer-id', BUYER_ONE)
			.send({ cartId, addressId: ADDRESS_ONE });

		await request(app.getHttpServer())
			.post('/api/cart/items')
			.set('x-customer-id', BUYER_TWO)
			.send({ variantId: NOTEBOOK_VARIANT, quantity: 1 });

		const buyerTwoCartResponse = await request(app.getHttpServer())
			.get('/api/cart')
			.set('x-customer-id', BUYER_TWO);

		const buyerTwoCartId = buyerTwoCartResponse.body.data.cart.cart_id;

		await request(app.getHttpServer())
			.post('/api/orders')
			.set('x-customer-id', BUYER_TWO)
			.send({ cartId: buyerTwoCartId, addressId: ADDRESS_ONE });

		await entityManager.getConnection().execute(
			'UPDATE sale_snapshot_unit_stocks SET quantity = 0 WHERE id = ?',
			[NOTEBOOK_VARIANT],
			'run',
		);

		await request(app.getHttpServer())
			.post('/api/cart/items')
			.set('x-customer-id', BUYER_ONE)
			.send({ variantId: NOTEBOOK_VARIANT, quantity: 1 });

		await request(app.getHttpServer())
			.post('/api/orders')
			.set('x-customer-id', BUYER_ONE)
			.send({ cartId, addressId: ADDRESS_ONE });

		await request(app.getHttpServer())
			.post(`/api/orders/${ORDER_SUCCESS}/payment-attempts`)
			.set('x-customer-id', BUYER_ONE)
			.send({ requestKey: 'req-success-001', outcome: 'success' });

		await request(app.getHttpServer())
			.post(`/api/orders/${ORDER_FAILURE}/payment-attempts`)
			.set('x-customer-id', BUYER_TWO)
			.send({ requestKey: 'req-fail-invalid', outcome: 'fail' });

		await request(app.getHttpServer())
			.post(`/api/orders/${ORDER_FAILURE}/payment-attempts`)
			.set('x-customer-id', BUYER_TWO)
			.send({ requestKey: 'req-fail-001', outcome: 'fail', failureCode: 'CARD_DECLINED' });

		const after = await request(app.getHttpServer()).get('/metrics');

		expect(
			getMetricValue(after.text, 'mwa_cart_add_total', { result: 'success' })
			- getMetricValue(before.text, 'mwa_cart_add_total', { result: 'success' }),
		).toBe(2);
		expect(
			getMetricValue(after.text, 'mwa_cart_add_total', { result: 'validation_error' })
			- getMetricValue(before.text, 'mwa_cart_add_total', { result: 'validation_error' }),
		).toBe(1);
		expect(
			getMetricValue(after.text, 'mwa_cart_add_total', { result: 'conflict' })
			- getMetricValue(before.text, 'mwa_cart_add_total', { result: 'conflict' }),
		).toBe(1);
		expect(
			getMetricValue(after.text, 'mwa_order_create_total', { result: 'success' })
			- getMetricValue(before.text, 'mwa_order_create_total', { result: 'success' }),
		).toBe(1);
		expect(
			getMetricValue(after.text, 'mwa_order_create_total', { result: 'error' })
			- getMetricValue(before.text, 'mwa_order_create_total', { result: 'error' }),
		).toBe(1);
		expect(
			getMetricValue(after.text, 'mwa_order_create_total', { result: 'conflict' })
			- getMetricValue(before.text, 'mwa_order_create_total', { result: 'conflict' }),
		).toBe(1);
		expect(
			getMetricValue(after.text, 'mwa_payment_attempt_total', { result: 'started' })
			- getMetricValue(before.text, 'mwa_payment_attempt_total', { result: 'started' }),
		).toBe(2);
		expect(
			getMetricValue(after.text, 'mwa_payment_attempt_total', { result: 'succeeded' })
			- getMetricValue(before.text, 'mwa_payment_attempt_total', { result: 'succeeded' }),
		).toBe(1);
		expect(
			getMetricValue(after.text, 'mwa_payment_attempt_total', { result: 'failed' })
			- getMetricValue(before.text, 'mwa_payment_attempt_total', { result: 'failed' }),
		).toBe(1);
		expect(
			getMetricValue(after.text, 'mwa_payment_attempt_total', { result: 'validation_error' })
			- getMetricValue(before.text, 'mwa_payment_attempt_total', { result: 'validation_error' }),
		).toBe(1);
	});
});
