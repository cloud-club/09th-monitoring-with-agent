import type { PaginationQuery } from '../http/pagination';

import { Controller, Get, Query } from '@nestjs/common';
import { ok } from '../http/contracts';
import { BadRequestError } from '../http/http-error';
import { createPaginationMeta } from '../http/pagination';
import { PaginationQueryPipe } from '../http/pipes/pagination-query.pipe';

/**
 * TODO(backlog): Remove these T5 contract routes once real API modules replace the temporary contract surface.
 */
@Controller('/contract')
export class ContractController {
	@Get('/pagination')
	public getPagination(@Query(PaginationQueryPipe) query: PaginationQuery) {
		return ok(
			{
				page: query.page,
				limit: query.limit,
			},
			createPaginationMeta(query, 0),
		);
	}

	@Get('/bad-request')
	public getBadRequest(): never {
		throw new BadRequestError('Bad request sample');
	}

	@Get('/error')
	public getError(): never {
		throw new Error('Unexpected runtime failure');
	}
}
