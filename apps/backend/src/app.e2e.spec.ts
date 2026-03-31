import { expect, test } from '@playwright/test';

test.describe('backend api e2e', () => {
	const webServerHost = process.env.PLAYWRIGHT_WEB_SERVER_HOST ?? '127.0.0.1';
	const webServerPort = process.env.PLAYWRIGHT_WEB_SERVER_PORT ?? '40123';
	const serverUrl = process.env.PLAYWRIGHT_BASE_URL ?? `http://${webServerHost}:${webServerPort}`;

	test('returns the health contract from a running backend process', async ({ request }) => {
		const response = await request.get(`${serverUrl}/health`);

		expect(response.status()).toBe(200);
		await expect(response.json()).resolves.toEqual({
			success: true,
			data: {
				status: 'ok',
			},
		});
	});

	test('exposes prometheus metrics from a running backend process', async ({ request }) => {
		await request.get(`${serverUrl}/health`);

		const response = await request.get(`${serverUrl}/metrics`);

		expect(response.status()).toBe(200);
		expect(response.headers()['content-type'] ?? '').toMatch(/text\/plain/);
		await expect(response.text()).resolves.toMatch(/mwa_http_requests_total/);
	});

	test('returns seeded catalog products from a running backend process', async ({ request }) => {
		const response = await request.get(`${serverUrl}/api/catalog/products?page=1&limit=2&sort=newest`);

		expect(response.status()).toBe(200);
		const body = await response.json();

		expect(body).toMatchObject({
			success: true,
			meta: {
				pagination: {
					page: 1,
					limit: 2,
					total: 6,
					totalPages: 3,
				},
			},
		});
		expect(body.data.items).toHaveLength(2);
		expect(body.data.items[0]).toMatchObject({
			title: 'Monitoring Notebook',
			product_id: '77777777-7777-4777-8777-777777777771',
			snapshot_id: '88888888-8888-4888-8888-888888888881',
		});
	});
});
