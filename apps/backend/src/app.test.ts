import type { INestApplication } from '@nestjs/common';
import assert from 'node:assert/strict';

import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, it } from 'vitest';

import { ERROR_CODES } from './http/error-codes';
import { HttpExceptionFilter } from './http/http-exception.filter';

let app: INestApplication;

beforeAll(async () => {
	process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/mwa_backend';

	const { AppModule } = await import('./app.module');

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

it('gET /health returns ok response', async () => {
	const response = await request(app.getHttpServer()).get('/health');

	assert.equal(response.status, 200);
	assert.deepEqual(response.body, {
		success: true,
		data: {
			status: 'ok',
		},
	});
});

it('gET /metrics returns prometheus metrics text', async () => {
	await request(app.getHttpServer()).get('/health');

	const response = await request(app.getHttpServer()).get('/metrics');

	assert.equal(response.status, 200);
	assert.match(response.headers['content-type'] ?? '', /text\/plain/);
	assert.match(response.text, /mwa_http_requests_total/);
});

it('gET /contract/pagination applies pagination defaults', async () => {
	const response = await request(app.getHttpServer()).get('/contract/pagination');

	assert.equal(response.status, 200);
	assert.deepEqual(response.body, {
		success: true,
		data: {
			page: 1,
			limit: 20,
		},
		meta: {
			page: 1,
			limit: 20,
			total: 0,
			totalPages: 1,
		},
	});
});

it('gET /contract/pagination returns validation error on invalid query', async () => {
	const response = await request(app.getHttpServer()).get('/contract/pagination?page=0');

	assert.equal(response.status, 400);
	assert.equal(response.body.success, false);
	assert.equal(response.body.error.code, ERROR_CODES.VALIDATION_ERROR);
	assert.equal(response.body.error.message, 'Request validation failed');
	assert.ok(Array.isArray(response.body.error.details.issues));
});

it('gET /contract/pagination rejects over max limit', async () => {
	const response = await request(app.getHttpServer()).get('/contract/pagination?limit=101');

	assert.equal(response.status, 400);
	assert.equal(response.body.success, false);
	assert.equal(response.body.error.code, ERROR_CODES.VALIDATION_ERROR);
});

it('gET /contract/pagination rejects empty-string page value', async () => {
	const response = await request(app.getHttpServer()).get('/contract/pagination?page=');

	assert.equal(response.status, 400);
	assert.equal(response.body.success, false);
	assert.equal(response.body.error.code, ERROR_CODES.VALIDATION_ERROR);
});

it('gET /contract/bad-request returns fixed bad request envelope', async () => {
	const response = await request(app.getHttpServer()).get('/contract/bad-request');

	assert.equal(response.status, 400);
	assert.deepEqual(response.body, {
		success: false,
		error: {
			code: ERROR_CODES.BAD_REQUEST,
			message: 'Bad request sample',
		},
	});
});

it('gET /contract/error returns fixed internal server error envelope', async () => {
	const response = await request(app.getHttpServer()).get('/contract/error');

	assert.equal(response.status, 500);
	assert.deepEqual(response.body, {
		success: false,
		error: {
			code: ERROR_CODES.INTERNAL_SERVER_ERROR,
			message: 'Internal server error',
		},
	});
});

it('gET /unknown route returns fixed not-found envelope', async () => {
	const response = await request(app.getHttpServer()).get('/unknown');

	assert.equal(response.status, 404);
	assert.deepEqual(response.body, {
		success: false,
		error: {
			code: ERROR_CODES.NOT_FOUND,
			message: 'Route not found',
		},
	});
});
