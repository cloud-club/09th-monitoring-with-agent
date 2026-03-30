import assert from 'node:assert/strict'
import test from 'node:test'

import request from 'supertest'

import { createMonitoringApp } from './app'

test('GET /health returns ok response', async () => {
  const app = createMonitoringApp({
    fetchBackendHealth: async () => ({
      status: 'ok',
      source: 'http://localhost:8080'
    })
  })

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

test('GET / returns server-rendered HTML with backend status', async () => {
  const app = createMonitoringApp({
    fetchBackendHealth: async () => ({
      status: 'ok',
      source: 'http://localhost:8080'
    })
  })

  const response = await request(app).get('/')

  assert.equal(response.status, 200)
  assert.match(response.text, /Monitoring App \(SSR baseline\)/)
  assert.match(response.text, /Backend API health: ok/)
})
