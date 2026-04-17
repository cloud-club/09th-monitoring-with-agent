import { expect, test } from '@playwright/test'

import { execFileSync } from 'node:child_process'

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { PrismaClient } from '@prisma/client'

const webServerHost = process.env.PLAYWRIGHT_WEB_SERVER_HOST ?? '127.0.0.1'
const webServerPort = process.env.PLAYWRIGHT_WEB_SERVER_PORT ?? '40123'
const serverUrl = process.env.PLAYWRIGHT_BASE_URL ?? `http://${webServerHost}:${webServerPort}`
const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://mwa:mwa@localhost:5432/mwa?schema=public'
const logFilePath = join(process.cwd(), 'logs', 'mwa-app.log')
const evidenceDir = resolve(process.cwd(), '..', '..', '.sisyphus', 'evidence')
const successEvidencePath = join(evidenceDir, 'task-17-smoke-success.txt')
const failureEvidencePath = join(evidenceDir, 'task-17-smoke-failure.txt')

const BUYER_ONE = '11111111-1111-4111-8111-111111111111'
const BUYER_TWO = '11111111-1111-4111-8111-111111111112'
const ADDRESS_ONE = '22222222-2222-4222-8222-222222222221'
const ADDRESS_TWO = '22222222-2222-4222-8222-222222222222'
const NOTEBOOK_PRODUCT = '77777777-7777-4777-8777-777777777771'
const NOTEBOOK_VARIANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'

type LogRecord = Record<string, string | number | boolean | null>

const prisma = new PrismaClient({
	datasources: {
		db: {
			url: databaseUrl,
		},
	},
})

function resetDatabase(): void {
	execFileSync('npm', ['run', 'db:reset:test'], {
		cwd: process.cwd(),
		env: {
			...process.env,
			DATABASE_URL: databaseUrl,
		},
		stdio: 'pipe',
	})
}

function cleanArtifacts(evidencePath: string): void {
	rmSync(logFilePath, { force: true })
	rmSync(evidencePath, { force: true })
	mkdirSync(evidenceDir, { recursive: true })
}

function readStructuredLogs(): LogRecord[] {
	try {
		return readFileSync(logFilePath, 'utf8')
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line.startsWith('{'))
			.map((line) => JSON.parse(line) as LogRecord)
	} catch {
		return []
	}
}

function extractMetricLines(metricsText: string, metricNames: readonly string[]): string[] {
	return metricsText
		.split('\n')
		.filter((line) => metricNames.some((metricName) => line.startsWith(metricName)))
}

function readCounterValue(metricsText: string, metricLinePrefix: string): number {
	const line = metricsText
		.split('\n')
		.find((candidate) => candidate.startsWith(metricLinePrefix))

	if (line === undefined) {
		return 0
	}

	return Number(line.slice(metricLinePrefix.length).trim())
}

function collectMetricDeltas(
	beforeMetricsText: string,
	afterMetricsText: string,
	metricLinePrefixes: readonly string[],
): string[] {
	return metricLinePrefixes.map((prefix) => {
		const beforeValue = readCounterValue(beforeMetricsText, prefix)
		const afterValue = readCounterValue(afterMetricsText, prefix)
		return `${prefix} ${afterValue - beforeValue}`
	})
}

function writeEvidence(filePath: string, sections: ReadonlyArray<readonly [string, string]>): void {
	const content = sections
		.map(([title, body]) => `## ${title}\n${body}`)
		.join('\n\n')

	writeFileSync(filePath, `${content}\n`, 'utf8')
}

async function waitForLogFlush(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 50))
}

async function waitForDomainEvents(requestIdPrefix: string, eventNames: readonly string[]): Promise<LogRecord[]> {
	await expect
		.poll(() => {
			const logs = readStructuredLogs()
			const relevantLogs = logs.filter((record) => String(record.request_id).startsWith(requestIdPrefix))
			const seenEventNames = new Set(
				relevantLogs
					.map((record) => record.event_name)
					.filter((eventName): eventName is string => typeof eventName === 'string'),
			)

			return eventNames.every((eventName) => seenEventNames.has(eventName))
		}, {
			timeout: 2_000,
			intervals: [100, 200, 400],
		})
		.toBe(true)

	return readStructuredLogs().filter((record) => String(record.request_id).startsWith(requestIdPrefix))
}

test.describe('T17 seeded full-funnel smoke', () => {
	test.beforeEach(async ({}, testInfo) => {
		if (process.env.T17_SKIP_INTERNAL_RESET !== '1') {
			resetDatabase()
		}

		const evidencePath = testInfo.title.includes('success funnel')
			? successEvidencePath
			: failureEvidencePath
		cleanArtifacts(evidencePath)
	})

	test.afterAll(async () => {
		await prisma.$disconnect()
	})

	test('runs the seeded success funnel end-to-end and captures evidence', async ({ request }) => {
		const beforeMetrics = await request.get(`${serverUrl}/metrics`, {
			headers: { 'x-request-id': 't17-success-metrics-before' },
		})
		expect(beforeMetrics.status()).toBe(200)
		const beforeMetricsText = await beforeMetrics.text()

		const productList = await request.get(`${serverUrl}/api/catalog/products?page=1&limit=2`, {
			headers: { 'x-request-id': 't17-success-list' },
		})
		expect(productList.status()).toBe(200)
		const productListJson = await productList.json()
		expect(productListJson.data.items[0].product_id).toBe(NOTEBOOK_PRODUCT)

		const productDetail = await request.get(`${serverUrl}/api/catalog/products/${NOTEBOOK_PRODUCT}`, {
			headers: { 'x-request-id': 't17-success-detail' },
		})
		expect(productDetail.status()).toBe(200)

		const recommendations = await request.get(`${serverUrl}/api/catalog/products/${NOTEBOOK_PRODUCT}/recommendations?limit=2`, {
			headers: { 'x-request-id': 't17-success-recommendations' },
		})
		expect(recommendations.status()).toBe(200)

		const cartAdded = await request.post(`${serverUrl}/api/cart/items`, {
			headers: {
				'x-customer-id': BUYER_ONE,
				'x-request-id': 't17-success-cart-add',
			},
			data: { variantId: NOTEBOOK_VARIANT, quantity: 1 },
		})
		expect(cartAdded.status()).toBe(201)
		const cartAddedJson = await cartAdded.json()
		const cartId = cartAddedJson.data.cart.cart_id as string
		const cartItemId = cartAddedJson.data.cart.items[0].cart_item_id as string

		const cartUpdated = await request.patch(`${serverUrl}/api/cart/items/${cartItemId}`, {
			headers: {
				'x-customer-id': BUYER_ONE,
				'x-request-id': 't17-success-cart-update',
			},
			data: { quantity: 2 },
		})
		expect(cartUpdated.status()).toBe(200)

		const orderCreated = await request.post(`${serverUrl}/api/orders`, {
			headers: {
				'x-customer-id': BUYER_ONE,
				'x-request-id': 't17-success-order',
			},
			data: { cartId, addressId: ADDRESS_ONE },
		})
		expect(orderCreated.status()).toBe(201)
		const orderCreatedJson = await orderCreated.json()
		const orderId = orderCreatedJson.data.order.order_id as string

		const paymentSucceeded = await request.post(`${serverUrl}/api/orders/${orderId}/payment-attempts`, {
			headers: {
				'x-customer-id': BUYER_ONE,
				'x-request-id': 't17-success-payment',
			},
			data: { requestKey: 't17-success-001', outcome: 'success' },
		})
		expect(paymentSucceeded.status()).toBe(201)

		const orderAfter = await request.get(`${serverUrl}/api/orders/${orderId}`, {
			headers: {
				'x-customer-id': BUYER_ONE,
				'x-request-id': 't17-success-order-after',
			},
		})
		expect(orderAfter.status()).toBe(200)
		const orderAfterJson = await orderAfter.json()
		expect(orderAfterJson.data.order.status).toBe('paid')

		const paidRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
			SELECT COUNT(*)::bigint AS count FROM order_payments WHERE order_id = ${orderId}::uuid
		`
		expect(Number(paidRows[0]?.count ?? 0)).toBe(1)

		const attemptRows = await prisma.$queryRaw<Array<{ status: string }>>`
			SELECT status FROM payment_attempts WHERE order_id = ${orderId}::uuid ORDER BY created_at ASC
		`
		expect(attemptRows).toEqual([{ status: 'succeeded' }])

		const metricsResponse = await request.get(`${serverUrl}/metrics`, {
			headers: { 'x-request-id': 't17-success-metrics' },
		})
		expect(metricsResponse.status()).toBe(200)
		const metricsText = await metricsResponse.text()
		const successMetricLines = collectMetricDeltas(beforeMetricsText, metricsText, [
			'mwa_http_requests_total{service="backend",handler="/api/catalog/products",method="GET",status_code="200"}',
			'mwa_http_requests_total{service="backend",handler="/api/catalog/products/:productId",method="GET",status_code="200"}',
			'mwa_http_requests_total{service="backend",handler="/api/catalog/products/:productId/recommendations",method="GET",status_code="200"}',
			'mwa_http_requests_total{service="backend",handler="/api/cart/items",method="POST",status_code="201"}',
			'mwa_http_requests_total{service="backend",handler="/api/cart/items/:cartItemId",method="PATCH",status_code="200"}',
			'mwa_http_requests_total{service="backend",handler="/api/orders",method="POST",status_code="201"}',
			'mwa_http_requests_total{service="backend",handler="/api/orders/:orderId/payment-attempts",method="POST",status_code="201"}',
			'mwa_http_requests_total{service="backend",handler="/api/orders/:orderId",method="GET",status_code="200"}',
			'mwa_order_create_total{result="success"}',
			'mwa_payment_attempt_total{result="started"}',
			'mwa_payment_attempt_total{result="succeeded"}',
		])
		expect(successMetricLines).toEqual([
			'mwa_http_requests_total{service="backend",handler="/api/catalog/products",method="GET",status_code="200"} 1',
			'mwa_http_requests_total{service="backend",handler="/api/catalog/products/:productId",method="GET",status_code="200"} 1',
			'mwa_http_requests_total{service="backend",handler="/api/catalog/products/:productId/recommendations",method="GET",status_code="200"} 1',
			'mwa_http_requests_total{service="backend",handler="/api/cart/items",method="POST",status_code="201"} 1',
			'mwa_http_requests_total{service="backend",handler="/api/cart/items/:cartItemId",method="PATCH",status_code="200"} 1',
			'mwa_http_requests_total{service="backend",handler="/api/orders",method="POST",status_code="201"} 1',
			'mwa_http_requests_total{service="backend",handler="/api/orders/:orderId/payment-attempts",method="POST",status_code="201"} 1',
			'mwa_http_requests_total{service="backend",handler="/api/orders/:orderId",method="GET",status_code="200"} 1',
			'mwa_order_create_total{result="success"} 1',
			'mwa_payment_attempt_total{result="started"} 1',
			'mwa_payment_attempt_total{result="succeeded"} 1',
		])

		await waitForLogFlush()
		const relevantLogs = await waitForDomainEvents('t17-success-', [
			'product.list_viewed',
			'product.detail_viewed',
			'recommendation.shown',
			'cart.item_added',
			'cart.item_updated',
			'order.created',
			'payment.started',
			'payment.succeeded',
		])

		writeEvidence(successEvidencePath, [
			['HTTP responses', JSON.stringify({
				productList: productList.status(),
				productDetail: productDetail.status(),
				recommendations: recommendations.status(),
				cartAdded: cartAdded.status(),
				cartUpdated: cartUpdated.status(),
				orderCreated: orderCreated.status(),
				paymentSucceeded: paymentSucceeded.status(),
				orderAfter: orderAfter.status(),
			}, null, 2)],
			['DB state', JSON.stringify({
				orderId,
				orderStatus: orderAfterJson.data.order.status,
				paymentAttempts: attemptRows,
				orderPayments: Number(paidRows[0]?.count ?? 0),
			}, null, 2)],
			['Metrics', successMetricLines.join('\n')],
			['Logs', JSON.stringify(relevantLogs, null, 2)],
		])
	})

	test('runs the seeded failure funnel end-to-end and captures evidence', async ({ request }) => {
		const beforeMetrics = await request.get(`${serverUrl}/metrics`, {
			headers: { 'x-request-id': 't17-failure-metrics-before' },
		})
		expect(beforeMetrics.status()).toBe(200)
		const beforeMetricsText = await beforeMetrics.text()

		const searchResults = await request.get(`${serverUrl}/api/search?q=Notebook&page=1&limit=20`, {
			headers: { 'x-request-id': 't17-failure-search' },
		})
		expect(searchResults.status()).toBe(200)

		const productDetail = await request.get(`${serverUrl}/api/catalog/products/${NOTEBOOK_PRODUCT}`, {
			headers: { 'x-request-id': 't17-failure-detail' },
		})
		expect(productDetail.status()).toBe(200)

		const recommendations = await request.get(`${serverUrl}/api/catalog/products/${NOTEBOOK_PRODUCT}/recommendations?limit=2`, {
			headers: { 'x-request-id': 't17-failure-recommendations' },
		})
		expect(recommendations.status()).toBe(200)

		const cartAdded = await request.post(`${serverUrl}/api/cart/items`, {
			headers: {
				'x-customer-id': BUYER_TWO,
				'x-request-id': 't17-failure-cart-add',
			},
			data: { variantId: NOTEBOOK_VARIANT, quantity: 1 },
		})
		expect(cartAdded.status()).toBe(201)
		const cartAddedJson = await cartAdded.json()
		const cartId = cartAddedJson.data.cart.cart_id as string
		const cartItemId = cartAddedJson.data.cart.items[0].cart_item_id as string

		const cartUpdated = await request.patch(`${serverUrl}/api/cart/items/${cartItemId}`, {
			headers: {
				'x-customer-id': BUYER_TWO,
				'x-request-id': 't17-failure-cart-update',
			},
			data: { quantity: 2 },
		})
		expect(cartUpdated.status()).toBe(200)

		const orderCreated = await request.post(`${serverUrl}/api/orders`, {
			headers: {
				'x-customer-id': BUYER_TWO,
				'x-request-id': 't17-failure-order',
			},
			data: { cartId, addressId: ADDRESS_TWO },
		})
		expect(orderCreated.status()).toBe(201)
		const orderCreatedJson = await orderCreated.json()
		const orderId = orderCreatedJson.data.order.order_id as string

		const paymentFailed = await request.post(`${serverUrl}/api/orders/${orderId}/payment-attempts`, {
			headers: {
				'x-customer-id': BUYER_TWO,
				'x-request-id': 't17-failure-payment',
			},
			data: { requestKey: 't17-failure-001', outcome: 'fail', failureCode: 'CARD_DECLINED' },
		})
		expect(paymentFailed.status()).toBe(201)

		const orderAfter = await request.get(`${serverUrl}/api/orders/${orderId}`, {
			headers: {
				'x-customer-id': BUYER_TWO,
				'x-request-id': 't17-failure-order-after',
			},
		})
		expect(orderAfter.status()).toBe(200)
		const orderAfterJson = await orderAfter.json()
		expect(orderAfterJson.data.order.status).toBe('payment_failed')

		const paidRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
			SELECT COUNT(*)::bigint AS count FROM order_payments WHERE order_id = ${orderId}::uuid
		`
		expect(Number(paidRows[0]?.count ?? 0)).toBe(0)

		const attemptRows = await prisma.$queryRaw<Array<{ status: string; failure_code: string | null }>>`
			SELECT status, failure_code FROM payment_attempts WHERE order_id = ${orderId}::uuid ORDER BY created_at ASC
		`
		expect(attemptRows).toEqual([{ status: 'failed', failure_code: 'CARD_DECLINED' }])

		const metricsResponse = await request.get(`${serverUrl}/metrics`, {
			headers: { 'x-request-id': 't17-failure-metrics' },
		})
		expect(metricsResponse.status()).toBe(200)
		const metricsText = await metricsResponse.text()
		const failureMetricLines = collectMetricDeltas(beforeMetricsText, metricsText, [
			'mwa_http_requests_total{service="backend",handler="/api/search",method="GET",status_code="200"}',
			'mwa_http_requests_total{service="backend",handler="/api/catalog/products/:productId",method="GET",status_code="200"}',
			'mwa_http_requests_total{service="backend",handler="/api/catalog/products/:productId/recommendations",method="GET",status_code="200"}',
			'mwa_http_requests_total{service="backend",handler="/api/cart/items",method="POST",status_code="201"}',
			'mwa_http_requests_total{service="backend",handler="/api/cart/items/:cartItemId",method="PATCH",status_code="200"}',
			'mwa_http_requests_total{service="backend",handler="/api/orders",method="POST",status_code="201"}',
			'mwa_http_requests_total{service="backend",handler="/api/orders/:orderId/payment-attempts",method="POST",status_code="201"}',
			'mwa_http_requests_total{service="backend",handler="/api/orders/:orderId",method="GET",status_code="200"}',
			'mwa_search_requests_total{result="success"}',
			'mwa_order_create_total{result="success"}',
			'mwa_payment_attempt_total{result="started"}',
			'mwa_payment_attempt_total{result="failed"}',
		])
		expect(failureMetricLines).toEqual([
			'mwa_http_requests_total{service="backend",handler="/api/search",method="GET",status_code="200"} 1',
			'mwa_http_requests_total{service="backend",handler="/api/catalog/products/:productId",method="GET",status_code="200"} 1',
			'mwa_http_requests_total{service="backend",handler="/api/catalog/products/:productId/recommendations",method="GET",status_code="200"} 1',
			'mwa_http_requests_total{service="backend",handler="/api/cart/items",method="POST",status_code="201"} 1',
			'mwa_http_requests_total{service="backend",handler="/api/cart/items/:cartItemId",method="PATCH",status_code="200"} 1',
			'mwa_http_requests_total{service="backend",handler="/api/orders",method="POST",status_code="201"} 1',
			'mwa_http_requests_total{service="backend",handler="/api/orders/:orderId/payment-attempts",method="POST",status_code="201"} 1',
			'mwa_http_requests_total{service="backend",handler="/api/orders/:orderId",method="GET",status_code="200"} 1',
			'mwa_search_requests_total{result="success"} 1',
			'mwa_order_create_total{result="success"} 1',
			'mwa_payment_attempt_total{result="started"} 1',
			'mwa_payment_attempt_total{result="failed"} 1',
		])

		await waitForLogFlush()
		const relevantLogs = await waitForDomainEvents('t17-failure-', [
			'search.executed',
			'product.detail_viewed',
			'recommendation.shown',
			'cart.item_added',
			'cart.item_updated',
			'order.created',
			'payment.started',
			'payment.failed',
		])

		writeEvidence(failureEvidencePath, [
			['HTTP responses', JSON.stringify({
				searchResults: searchResults.status(),
				productDetail: productDetail.status(),
				recommendations: recommendations.status(),
				cartAdded: cartAdded.status(),
				cartUpdated: cartUpdated.status(),
				orderCreated: orderCreated.status(),
				paymentFailed: paymentFailed.status(),
				orderAfter: orderAfter.status(),
			}, null, 2)],
			['DB state', JSON.stringify({
				orderId,
				orderStatus: orderAfterJson.data.order.status,
				paymentAttempts: attemptRows,
				orderPayments: Number(paidRows[0]?.count ?? 0),
			}, null, 2)],
			['Metrics', failureMetricLines.join('\n')],
			['Logs', JSON.stringify(relevantLogs, null, 2)],
		])
	})
})
