import request from 'supertest'

import { app } from './app'

describe('app integration behavior', () => {
  it('returns the health contract through the public HTTP interface', async () => {
    const response = await request(app).get('/health')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      success: true,
      data: {
        status: 'ok'
      }
    })
  })

  it('returns prometheus metrics text after requests are recorded', async () => {
    await request(app).get('/health')

    const response = await request(app).get('/metrics')

    expect(response.status).toBe(200)
    expect(response.headers['content-type'] ?? '').toMatch(/text\/plain/)
    expect(response.text).toMatch(/mwa_http_requests_total/)
  })
})
