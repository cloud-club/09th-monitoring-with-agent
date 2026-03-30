import { z } from 'zod'

export const PAGINATION_DEFAULTS = {
  page: 1,
  limit: 20,
  maxLimit: 100
} as const

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(PAGINATION_DEFAULTS.page),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(PAGINATION_DEFAULTS.maxLimit)
    .default(PAGINATION_DEFAULTS.limit)
})

export type PaginationQuery = z.infer<typeof paginationQuerySchema>

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
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
