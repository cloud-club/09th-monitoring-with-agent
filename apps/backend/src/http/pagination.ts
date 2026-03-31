import type { tags } from 'typia';

export const PAGINATION_DEFAULTS = {
	page: 1,
	limit: 20,
	maxLimit: 100,
} as const;

type PaginationPage = number & tags.Type<'int32'> & tags.Minimum<1>;
type PaginationLimit = number &
	tags.Type<'int32'> &
	tags.Minimum<1> &
	tags.Maximum<typeof PAGINATION_DEFAULTS.maxLimit>;

export type PaginationQuery = {
	page: PaginationPage;
	limit: PaginationLimit;
};

export type PaginationMeta = {
	page: number;
	limit: number;
	total: number;
	totalPages: number;
};

type PaginationResponseMeta = {
	pagination: PaginationMeta;
};

export function createPaginationMeta(
	query: PaginationQuery,
	total: number,
): PaginationResponseMeta {
	const totalPages = Math.max(1, Math.ceil(total / query.limit));

	return {
		pagination: {
			page: query.page,
			limit: query.limit,
			total,
			totalPages,
		},
	};
}
