import { ERROR_CODES, type ErrorCode } from './error-codes'

export class HttpError extends Error {
  public readonly statusCode: number
  public readonly code: ErrorCode
  public readonly details?: unknown

  public constructor(statusCode: number, code: ErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'HttpError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}

export class BadRequestError extends HttpError {
  public constructor(message: string, details?: unknown) {
    super(400, ERROR_CODES.BAD_REQUEST, message, details)
    this.name = 'BadRequestError'
  }
}

export class NotFoundError extends HttpError {
  public constructor(message: string, details?: unknown) {
    super(404, ERROR_CODES.NOT_FOUND, message, details)
    this.name = 'NotFoundError'
  }
}
