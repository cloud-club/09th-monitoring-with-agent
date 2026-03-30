import type { ErrorRequestHandler } from 'express'

import { fail } from './contracts'
import { ERROR_CODES } from './error-codes'
import { HttpError } from './http-error'

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof HttpError) {
    response.status(error.statusCode).json(fail(error.code, error.message, error.details))
    return
  }

  response
    .status(500)
    .json(fail(ERROR_CODES.INTERNAL_SERVER_ERROR, 'Internal server error'))
}
