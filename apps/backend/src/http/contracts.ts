import type { ErrorCode } from './error-codes';

export type ApiSuccessResponse<T> = {
	success: true;
	data: T;
	meta?: object;
};

export type ApiErrorBody = {
	code: ErrorCode;
	message: string;
	details?: unknown;
};

export type ApiErrorResponse = {
	success: false;
	error: ApiErrorBody;
};

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export function ok<T>(data: T, meta?: object): ApiSuccessResponse<T> {
	if (meta === undefined) {
		return {
			success: true,
			data,
		};
	}

	return {
		success: true,
		data,
		meta,
	};
}

export function fail(code: ErrorCode, message: string, details?: unknown): ApiErrorResponse {
	if (details === undefined) {
		return {
			success: false,
			error: {
				code,
				message,
			},
		};
	}

	return {
		success: false,
		error: {
			code,
			message,
			details,
		},
	};
}
