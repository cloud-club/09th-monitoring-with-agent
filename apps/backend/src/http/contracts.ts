import type { ErrorCode } from './error-codes';
import type { PaginationMeta } from './pagination';

export type ApiResponseMeta = {
	pagination?: PaginationMeta;
};

export type ApiErrorBody = {
	code: ErrorCode;
	message: string;
	details?: unknown;
};

type ApiResponseBase = {
	readonly success: boolean;
};

type ApiSuccessResponseWithoutMeta<TData> = {
	success: true;
	data: TData;
} & ApiResponseBase;

type ApiSuccessResponseWithMeta<TData, TMeta extends ApiResponseMeta> = {
	success: true;
	data: TData;
	meta: TMeta;
} & ApiResponseBase;

export type ApiSuccessResponse<TData, TMeta extends ApiResponseMeta | undefined = undefined>
	= TMeta extends ApiResponseMeta
		? ApiSuccessResponseWithMeta<TData, TMeta>
		: ApiSuccessResponseWithoutMeta<TData>;

export type ApiErrorResponse = {
	success: false;
	error: ApiErrorBody;
} & ApiResponseBase;

export function ok<TData>(data: TData): ApiSuccessResponse<TData>;
export function ok<TData, TMeta extends ApiResponseMeta>(
	data: TData,
	meta: TMeta,
): ApiSuccessResponse<TData, TMeta>;
export function ok<TData, TMeta extends ApiResponseMeta>(
	data: TData,
	meta?: TMeta,
): ApiSuccessResponseWithoutMeta<TData> | ApiSuccessResponseWithMeta<TData, TMeta> {
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
