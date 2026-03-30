import { expect, test } from '@playwright/test'

test.describe('Health endpoint e2e', () => {
  const serverUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:38080'

  test('returns configured stack response from public endpoint', async ({ request }) => {
    const response = await request.get(`${serverUrl}/health`, {
      params: {
        backendApiBaseUrl: 'http://localhost:9900/'
      }
    })

    expect(response.status()).toBe(200)
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        status: 'ok',
        stack: ['nest', 'mikro', 'jest', 'typia'],
        backendApiBaseUrl: 'http://localhost:9900'
      }
    })
  })

  test('returns 400 for invalid backendApiBaseUrl', async ({ request }) => {
    const response = await request.get(`${serverUrl}/health`, {
      params: {
        backendApiBaseUrl: 'invalid-url'
      }
    })

    expect(response.status()).toBe(400)
    const body = await response.json()
    expect(body.message).toBe('backendApiBaseUrl must be a valid http(s) URL')
  })
})
