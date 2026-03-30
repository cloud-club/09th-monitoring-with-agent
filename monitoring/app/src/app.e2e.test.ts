import assert from 'node:assert/strict'
import test from 'node:test'

import request from 'supertest'

import { createMonitoringApp } from './app'

test('E2E smoke: app is reachable and renders unavailable backend status', async () => {
  const app = createMonitoringApp({
    fetchBackendHealth: async () => ({
      status: 'unavailable',
      source: 'http://localhost:8080'
    })
  })

  const response = await request(app).get('/')

  assert.equal(response.status, 200)
  assert.match(response.text, /Backend API health: unavailable/)
})
