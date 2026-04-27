import type { PaginationQuery } from '../http/pagination';

import { Controller, Get, Post, Query } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ok } from '../http/contracts';
import { BadRequestError, NotFoundError } from '../http/http-error';
import { createPaginationMeta } from '../http/pagination';
import { PaginationQueryPipe } from '../http/pipes/pagination-query.pipe';

const execFileAsync = promisify(execFile);

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

	@Post('/qa/reset-seed')
	public async resetQaSeed() {
		if (process.env.QA_SCENARIO_RESET_ENABLED !== 'true') {
			throw new NotFoundError('Route not found');
		}

		await execFileAsync('node', ['prisma/seed.js'], {
			cwd: process.cwd(),
			timeout: 30_000,
		});

		return ok({ status: 'reset' });
	}
}
