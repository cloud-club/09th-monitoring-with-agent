import assert from 'node:assert/strict'
import test from 'node:test'

import request from 'supertest'

import { app } from './app'

test('GET /health returns ok response', async () => {
  const response = await request(app).get('/health')

  assert.equal(response.status, 200)
  assert.deepEqual(response.body, {
    success: true,
    data: {
      status: 'ok'
    }
  })
})

test('GET /metrics returns prometheus metrics text', async () => {
  await request(app).get('/health')

  const response = await request(app).get('/metrics')

  assert.equal(response.status, 200)
  assert.match(response.headers['content-type'] ?? '', /text\/plain/)
  assert.match(response.text, /mwa_http_requests_total/)
})
