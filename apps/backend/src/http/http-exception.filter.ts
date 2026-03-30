import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus
} from '@nestjs/common'

import { fail } from './contracts'
import { ERROR_CODES } from './error-codes'
import { HttpError } from './http-error'

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  public catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp()
    const response = context.getResponse()

    if (exception instanceof HttpError) {
      response.status(exception.statusCode).json(fail(exception.code, exception.message, exception.details))
      return
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus()

      if (statusCode === HttpStatus.NOT_FOUND) {
        response.status(statusCode).json(fail(ERROR_CODES.NOT_FOUND, 'Route not found'))
        return
      }

      if (statusCode === HttpStatus.BAD_REQUEST) {
        response.status(statusCode).json(fail(ERROR_CODES.BAD_REQUEST, 'Bad request'))
        return
      }
    }

    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json(fail(ERROR_CODES.INTERNAL_SERVER_ERROR, 'Internal server error'))
  }
}
