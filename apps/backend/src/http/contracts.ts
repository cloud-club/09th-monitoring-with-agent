import type { ErrorCode } from './error-codes';
import type { PaginationMeta } from './pagination';

export type ApiResponseMeta = {
	pagination?: PaginationMeta;
};

export type ApiSuccessResponse<TData, TMeta extends ApiResponseMeta | undefined = undefined> = {
	success: true;
	data: TData;
	meta?: TMeta;
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

export type ApiResponse<TData, TMeta extends ApiResponseMeta | undefined = undefined>
	= | ApiSuccessResponse<TData, TMeta>
		| ApiErrorResponse;

export function ok<TData>(data: TData): ApiSuccessResponse<TData>;
export function ok<TData, TMeta extends ApiResponseMeta>(
	data: TData,
	meta: TMeta,
): ApiSuccessResponse<TData, TMeta>;
export function ok<TData, TMeta extends ApiResponseMeta>(
	data: TData,
	meta?: TMeta,
): ApiSuccessResponse<TData, TMeta> {
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
