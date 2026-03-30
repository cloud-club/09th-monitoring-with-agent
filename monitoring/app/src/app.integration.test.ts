import assert from 'node:assert/strict'
import test from 'node:test'

import request from 'supertest'

import { createMonitoringApp } from './app'

test('GET /health returns ok response', async () => {
  const app = createMonitoringApp()

  const response = await request(app).get('/health')

  assert.equal(response.status, 200)
  assert.deepEqual(response.body, {
    success: true,
    data: {
      status: 'ok',
      service: 'monitoring-app'
    }
  })
})

test('GET / returns server-rendered HTML in standalone mode', async () => {
  const app = createMonitoringApp()

  const response = await request(app).get('/')

  assert.equal(response.status, 200)
  assert.match(response.text, /Monitoring App \(SSR baseline\)/)
  assert.match(response.text, /Runtime mode: standalone/)
})
