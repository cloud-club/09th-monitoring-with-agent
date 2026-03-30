import assert from 'node:assert/strict'
import test from 'node:test'

import request from 'supertest'

import { app } from './app'
import { ERROR_CODES } from './http/error-codes'

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

test('GET /contract/pagination applies pagination defaults', async () => {
  const response = await request(app).get('/contract/pagination')

  assert.equal(response.status, 200)
  assert.deepEqual(response.body, {
    success: true,
    data: {
      page: 1,
      limit: 20
    },
    meta: {
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 1
    }
  })
})

test('GET /contract/pagination returns validation error on invalid query', async () => {
  const response = await request(app).get('/contract/pagination?page=0')

  assert.equal(response.status, 400)
  assert.equal(response.body.success, false)
  assert.equal(response.body.error.code, ERROR_CODES.VALIDATION_ERROR)
  assert.equal(response.body.error.message, 'Request validation failed')
  assert.ok(Array.isArray(response.body.error.details.issues))
})

test('GET /contract/pagination rejects over max limit', async () => {
  const response = await request(app).get('/contract/pagination?limit=101')

  assert.equal(response.status, 400)
  assert.equal(response.body.success, false)
  assert.equal(response.body.error.code, ERROR_CODES.VALIDATION_ERROR)
})

test('GET /contract/pagination rejects empty-string page value', async () => {
  const response = await request(app).get('/contract/pagination?page=')

  assert.equal(response.status, 400)
  assert.equal(response.body.success, false)
  assert.equal(response.body.error.code, ERROR_CODES.VALIDATION_ERROR)
})

test('GET /contract/bad-request returns fixed bad request envelope', async () => {
  const response = await request(app).get('/contract/bad-request')

  assert.equal(response.status, 400)
  assert.deepEqual(response.body, {
    success: false,
    error: {
      code: ERROR_CODES.BAD_REQUEST,
      message: 'Bad request sample'
    }
  })
})

test('GET /contract/error returns fixed internal server error envelope', async () => {
  const response = await request(app).get('/contract/error')

  assert.equal(response.status, 500)
  assert.deepEqual(response.body, {
    success: false,
    error: {
      code: ERROR_CODES.INTERNAL_SERVER_ERROR,
      message: 'Internal server error'
    }
  })
})

test('GET /unknown route returns fixed not-found envelope', async () => {
  const response = await request(app).get('/unknown')

  assert.equal(response.status, 404)
  assert.deepEqual(response.body, {
    success: false,
    error: {
      code: ERROR_CODES.NOT_FOUND,
      message: 'Route not found'
    }
  })
})
