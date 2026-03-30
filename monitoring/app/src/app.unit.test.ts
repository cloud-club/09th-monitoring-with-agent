import assert from 'node:assert/strict'
import test from 'node:test'

import { renderHomePage } from './app'

test('renderHomePage includes backend source and status', () => {
  const html = renderHomePage({
    backendHealth: {
      status: 'ok',
      source: 'http://localhost:8080'
    }
  })

  assert.match(html, /Monitoring App \(SSR baseline\)/)
  assert.match(html, /Backend API source: http:\/\/localhost:8080/)
  assert.match(html, /Backend API health: ok/)
})
