import { expect, test } from '@playwright/test'

test.describe('backend api e2e', () => {
  const serverUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:38080'

  test('returns the health contract from a running backend process', async ({ request }) => {
    const response = await request.get(`${serverUrl}/health`)

    expect(response.status()).toBe(200)
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        status: 'ok'
      }
    })
  })

  test('exposes prometheus metrics over the running backend process', async ({ request }) => {
    await request.get(`${serverUrl}/health`)

    const response = await request.get(`${serverUrl}/metrics`)

    expect(response.status()).toBe(200)
    expect(response.headers()['content-type'] ?? '').toMatch(/text\/plain/)
    await expect(response.text()).resolves.toMatch(/mwa_http_requests_total/)
  })
})
