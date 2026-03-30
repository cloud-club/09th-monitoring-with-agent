import assert from 'node:assert/strict'
import test from 'node:test'

import request from 'supertest'

import { createMonitoringApp } from './app'

test('E2E smoke: app is reachable and renders standalone mode', async () => {
  const app = createMonitoringApp()

  const response = await request(app).get('/')

  assert.equal(response.status, 200)
  assert.match(response.text, /Runtime mode: standalone/)
})
