import type { RequestHandler, Response } from 'express'
import { ZodError, type ZodType } from 'zod'

import { ERROR_CODES } from './error-codes'
import { HttpError } from './http-error'

export type RequestTarget = 'body' | 'query' | 'params'

type ValidatedLocals = {
  validated?: Partial<Record<RequestTarget, unknown>>
}

export const validateRequest = <TSchema extends ZodType>(
  target: RequestTarget,
  schema: TSchema
): RequestHandler => {
  return (request, response, next) => {
    try {
      const parsed = schema.parse(request[target])
      response.locals.validated = {
        ...response.locals.validated,
        [target]: parsed
      }
      next()
    } catch (error) {
      if (error instanceof ZodError) {
        next(
          new HttpError(400, ERROR_CODES.VALIDATION_ERROR, 'Request validation failed', {
            issues: error.issues
          })
        )
        return
      }

      next(error)
    }
  }
}

export const getValidated = <T>(response: Response, target: RequestTarget): T => {
  const locals = response.locals as ValidatedLocals
  const value = locals.validated?.[target]

  if (value === undefined) {
    throw new HttpError(
      500,
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      `Validated ${target} data is missing from request context`
    )
  }

  return value as T
}
