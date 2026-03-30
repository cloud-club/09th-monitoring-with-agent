import express, { type Request, type Response } from 'express'

import { errorHandler } from './http/error-handler'
import { ok } from './http/contracts'
import {
  createPaginationMeta,
  type PaginationQuery,
  paginationQuerySchema
} from './http/pagination'
import { BadRequestError, NotFoundError } from './http/http-error'
import { getValidated, validateRequest } from './http/validation'

export const app = express()

app.use(express.json())

app.get('/health', (_request: Request, response: Response) => {
  response.status(200).json(ok({ status: 'ok' }))
})

app.get(
  '/contract/pagination',
  validateRequest('query', paginationQuerySchema),
  (_request: Request, response: Response) => {
    const query = getValidated<PaginationQuery>(response, 'query')

    response.status(200).json(
      ok(
        {
          page: query.page,
          limit: query.limit
        },
        createPaginationMeta(query, 0)
      )
    )
  }
)

app.get('/contract/bad-request', (_request: Request, _response: Response, next) => {
  next(new BadRequestError('Bad request sample'))
})

app.get('/contract/error', () => {
  throw new Error('Unexpected runtime failure')
})

app.use((_request, _response, next) => {
  next(new NotFoundError('Route not found'))
})

app.use(errorHandler)
