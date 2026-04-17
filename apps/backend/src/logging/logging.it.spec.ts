import type { INestApplication } from '@nestjs/common';

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HttpExceptionFilter } from '../http/http-exception.filter';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://mwa:mwa@localhost:5432/mwa?schema=public';
const BUYER_ONE = '11111111-1111-4111-8111-111111111111';
const BUYER_TWO = '11111111-1111-4111-8111-111111111112';
const ADDRESS_ONE = '22222222-2222-4222-8222-222222222221';
const NOTEBOOK_PRODUCT = '77777777-7777-4777-8777-777777777771';
const NOTEBOOK_VARIANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const ORDER_SUCCESS = '55555555-5555-4555-8555-555555555551';
const ORDER_FAILURE = '55555555-5555-4555-8555-555555555552';

type LogRecord = Record<string, string | number | boolean | null>;

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

function readJsonLines(filePath: string): LogRecord[] {
	return readFileSync(filePath, 'utf8')
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.startsWith('{'))
		.map((line) => JSON.parse(line) as LogRecord);
}

describe('structured logging integration behavior', () => {
	let app: INestApplication;
	let logDir: string;
	let stdoutSpy: ReturnType<typeof vi.spyOn> | undefined;

	beforeEach(async () => {
		resetDatabase();
		logDir = mkdtempSync(join(tmpdir(), 'mwa-backend-logs-'));
		process.env.DATABASE_URL = DATABASE_URL;
		process.env.LOG_DIR = logDir;
		process.env.NODE_ENV = 'test';

		stdoutSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

		const { AppModule } = await import('../app.module');
		const testingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();

		app = testingModule.createNestApplication();
		app.useGlobalFilters(new HttpExceptionFilter());
		await app.init();
	});

	afterEach(async () => {
		stdoutSpy?.mockRestore();

		if (app !== undefined) {
			await app.close();
		}

		rmSync(logDir, { recursive: true, force: true });
		delete process.env.LOG_DIR;
	});

	it('writes identical JSON payloads to stdout and file for success and failure flows', async () => {
		const activeStdoutSpy = stdoutSpy;
		if (activeStdoutSpy === undefined) {
			throw new Error('stdout spy was not initialized');
		}

		await request(app.getHttpServer())
			.get('/api/search?q=on&page=1&limit=20')
			.set('x-request-id', 'request-success-001');

		await request(app.getHttpServer())
			.get('/api/search?q=a&page=1&limit=20')
			.set('x-request-id', 'request-failure-001');

		const stdoutLines = activeStdoutSpy.mock.calls
			.map((call: unknown[]) => call[0])
			.filter((line): line is string => typeof line === 'string' && line.startsWith('{'));
		const fileLines = readFileSync(join(logDir, 'mwa-app.log'), 'utf8')
			.split('\n')
			.map((line: string) => line.trim())
			.filter((line) => line.startsWith('{'));

		expect(stdoutLines).toEqual(fileLines);

		const records = fileLines.map((line: string) => JSON.parse(line) as LogRecord);
		expect(records.length).toBeGreaterThanOrEqual(4);

		for (const record of records) {
			expect(record.timestamp).toEqual(expect.any(String));
			expect(record.level).toEqual(expect.any(String));
			expect(record.service).toBe('mwa-backend');
			expect(record.environment).toBe('test');
			expect(record.request_id).toEqual(expect.any(String));
			expect(record.endpoint).toEqual(expect.any(String));
			expect(record.method).toEqual(expect.any(String));
			expect(record.result).toEqual(expect.any(String));
		}

		expect(records.filter((record: LogRecord) => record.request_id === 'request-success-001')).toHaveLength(2);
		expect(records.filter((record: LogRecord) => record.request_id === 'request-failure-001')).toHaveLength(2);
	});

	it('emits the required domain event names with structured request-correlated payloads', async () => {
		await request(app.getHttpServer()).get('/api/catalog/products?page=1&limit=2').set('x-request-id', 'catalog-list-001');
		await request(app.getHttpServer()).get(`/api/catalog/products/${NOTEBOOK_PRODUCT}`).set('x-request-id', 'catalog-detail-001');
		await request(app.getHttpServer()).get('/api/search?q=on&page=1&limit=20').set('x-request-id', 'search-001');
		await request(app.getHttpServer()).get(`/api/catalog/products/${NOTEBOOK_PRODUCT}/recommendations?limit=2`).set('x-request-id', 'recommendation-001');

		const cartCreated = await request(app.getHttpServer())
			.post('/api/cart/items')
			.set('x-request-id', 'cart-add-001')
			.set('x-customer-id', BUYER_ONE)
			.send({ variantId: NOTEBOOK_VARIANT, quantity: 1 });

		const cartItemId = cartCreated.body.data.cart.items[0].cart_item_id;

		await request(app.getHttpServer())
			.patch(`/api/cart/items/${cartItemId}`)
			.set('x-request-id', 'cart-update-001')
			.set('x-customer-id', BUYER_ONE)
			.send({ quantity: 3 });

		const orderCreated = await request(app.getHttpServer())
			.post('/api/orders')
			.set('x-request-id', 'order-create-001')
			.set('x-customer-id', BUYER_ONE)
			.send({ cartId: cartCreated.body.data.cart.cart_id, addressId: ADDRESS_ONE });

		expect(orderCreated.status).toBe(201);

		await request(app.getHttpServer())
			.post(`/api/orders/${ORDER_SUCCESS}/payment-attempts`)
			.set('x-request-id', 'payment-success-001')
			.set('x-customer-id', BUYER_ONE)
			.send({ requestKey: 'req-success-001', outcome: 'success' });

		await request(app.getHttpServer())
			.post(`/api/orders/${ORDER_FAILURE}/payment-attempts`)
			.set('x-request-id', 'payment-failure-001')
			.set('x-customer-id', BUYER_TWO)
			.send({ requestKey: 'req-fail-001', outcome: 'fail', failureCode: 'CARD_DECLINED' });

		const records = readJsonLines(join(logDir, 'mwa-app.log'));
		const domainEvents = records.filter((record: LogRecord) => typeof record.event_name === 'string');
		const eventNames = new Set(domainEvents.map((record: LogRecord) => record.event_name));

		expect(eventNames).toEqual(new Set([
			'product.list_viewed',
			'product.detail_viewed',
			'search.executed',
			'recommendation.shown',
			'cart.item_added',
			'cart.item_updated',
			'order.created',
			'payment.started',
			'payment.succeeded',
			'payment.failed',
		]));

		for (const record of domainEvents) {
			expect(record.request_id).toEqual(expect.any(String));
			expect(record.endpoint).toEqual(expect.any(String));
			expect(record.method).toEqual(expect.any(String));
			expect(record.result).toEqual(expect.any(String));
		}

		expect(domainEvents.find((record: LogRecord) => record.event_name === 'product.detail_viewed')?.product_id).toBe(NOTEBOOK_PRODUCT);
		expect(domainEvents.find((record: LogRecord) => record.event_name === 'cart.item_added')?.variant_id).toBe(NOTEBOOK_VARIANT);
		expect(domainEvents.find((record: LogRecord) => record.event_name === 'order.created')?.cart_id).toEqual(expect.any(String));
		expect(domainEvents.find((record: LogRecord) => record.event_name === 'payment.succeeded')?.payment_id).toEqual(expect.any(String));
		expect(domainEvents.find((record: LogRecord) => record.event_name === 'payment.failed')?.error_code).toBe('CARD_DECLINED');
	});
});
