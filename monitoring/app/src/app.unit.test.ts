import assert from 'node:assert/strict'
import test from 'node:test'

import { renderHomePage } from './app'

test('renderHomePage includes standalone runtime marker', () => {
  const html = renderHomePage()

  assert.match(html, /Monitoring App \(SSR baseline\)/)
  assert.match(html, /Runtime mode: standalone/)
})
