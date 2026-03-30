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
