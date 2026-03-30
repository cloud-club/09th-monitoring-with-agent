import type { ErrorCode } from './error-codes'

export interface ApiSuccessResponse<T> {
  success: true
  data: T
  meta?: object
}

export interface ApiErrorBody {
  code: ErrorCode
  message: string
  details?: unknown
}

export interface ApiErrorResponse {
  success: false
  error: ApiErrorBody
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse

export const ok = <T>(data: T, meta?: object): ApiSuccessResponse<T> => {
  if (meta === undefined) {
    return {
      success: true,
      data
    }
  }

  return {
    success: true,
    data,
    meta
  }
}

export const fail = (code: ErrorCode, message: string, details?: unknown): ApiErrorResponse => {
  if (details === undefined) {
    return {
      success: false,
      error: {
        code,
        message
      }
    }
  }

  return {
    success: false,
    error: {
      code,
      message,
      details
    }
  }
}
