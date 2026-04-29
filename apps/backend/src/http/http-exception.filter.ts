import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { Catch, HttpException, HttpStatus } from '@nestjs/common';

import { fail } from './contracts';
import { ERROR_CODES } from './error-codes';
import { HttpError } from './http-error';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
	public catch(exception: unknown, host: ArgumentsHost): void {
		const context = host.switchToHttp();
		const response = context.getResponse<Response>();

		if (exception instanceof HttpError) {
			response.locals.log_error_code = exception.code;
			response
				.status(exception.statusCode)
				.json(fail(exception.code, exception.message, exception.details));
			return;
		}

		if (exception instanceof HttpException) {
			const statusCode = exception.getStatus();

			if (statusCode === HttpStatus.NOT_FOUND) {
				response.locals.log_error_code = ERROR_CODES.NOT_FOUND;
				response.status(statusCode).json(fail(ERROR_CODES.NOT_FOUND, 'Route not found'));
				return;
			}

			if (statusCode === HttpStatus.BAD_REQUEST) {
				response.locals.log_error_code = ERROR_CODES.BAD_REQUEST;
				response.status(statusCode).json(fail(ERROR_CODES.BAD_REQUEST, 'Bad request'));
				return;
			}

			if (statusCode === HttpStatus.UNAUTHORIZED) {
				response.locals.log_error_code = ERROR_CODES.UNAUTHORIZED;
				response.status(statusCode).json(fail(ERROR_CODES.UNAUTHORIZED, 'Unauthorized'));
				return;
			}
		}

		response.locals.log_error_code = ERROR_CODES.INTERNAL_SERVER_ERROR;
		response
			.status(HttpStatus.INTERNAL_SERVER_ERROR)
			.json(fail(ERROR_CODES.INTERNAL_SERVER_ERROR, 'Internal server error'));
	}
}
