import type { tags } from 'typia'

import { ERROR_CODES } from './error-codes'
import { HttpError } from './http-error'

export const PAGINATION_DEFAULTS = {
  page: 1,
  limit: 20,
  maxLimit: 100
} as const

export interface PaginationQuery {
  page: number & tags.Type<'int32'> & tags.Minimum<1>
  limit: number & tags.Type<'int32'> & tags.Minimum<1> & tags.Maximum<typeof PAGINATION_DEFAULTS.maxLimit>
}

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

const parseQueryNumber = (value: unknown): number | undefined => {
  if (value === undefined) {
    return undefined
  }

  if (typeof value === 'number') {
    return value
  }

  if (typeof value === 'string') {
    const normalized = value.trim()
    if (normalized.length === 0) {
      return Number.NaN
    }

    return Number(normalized)
  }

  return Number.NaN
}

const failValidation = (message: string, details: unknown): never => {
  throw new HttpError(400, ERROR_CODES.VALIDATION_ERROR, message, details)
}

export const parsePaginationQuery = (query: Record<string, unknown>): PaginationQuery => {
  const pageInput = parseQueryNumber(query.page)
  const limitInput = parseQueryNumber(query.limit)

  const page = pageInput ?? PAGINATION_DEFAULTS.page
  const limit = limitInput ?? PAGINATION_DEFAULTS.limit

  const issues: Array<{ path: string; message: string; value: unknown }> = []

  if (!Number.isInteger(page) || page < 1) {
    issues.push({
      path: 'page',
      message: 'page must be an integer greater than or equal to 1',
      value: query.page
    })
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > PAGINATION_DEFAULTS.maxLimit) {
    issues.push({
      path: 'limit',
      message: `limit must be an integer between 1 and ${PAGINATION_DEFAULTS.maxLimit}`,
      value: query.limit
    })
  }

  if (issues.length > 0) {
    failValidation('Request validation failed', { issues })
  }

  return {
    page,
    limit
  } as PaginationQuery
}

export const createPaginationMeta = (query: PaginationQuery, total: number): PaginationMeta => {
  const totalPages = Math.max(1, Math.ceil(total / query.limit))

  return {
    page: query.page,
    limit: query.limit,
    total,
    totalPages
  }
}
