import { createPaginationMeta, PAGINATION_DEFAULTS } from './pagination';

describe('pagination helpers', () => {
	it('creates pagination metadata from query and total', () => {
		expect(
			createPaginationMeta({ page: 2 as never, limit: 5 as never }, 11),
		).toEqual({
			pagination: {
				page: 2,
				limit: 5,
				total: 11,
				totalPages: 3,
			},
		});
	});

	it('keeps at least one page for empty results', () => {
		expect(
			createPaginationMeta(
				{ page: PAGINATION_DEFAULTS.page as never, limit: PAGINATION_DEFAULTS.limit as never },
				0,
			),
		).toEqual({
			pagination: {
				page: 1,
				limit: 20,
				total: 0,
				totalPages: 1,
			},
		});
	});
});
