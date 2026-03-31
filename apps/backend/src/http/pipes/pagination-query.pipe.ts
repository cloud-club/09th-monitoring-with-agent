import type { PipeTransform } from '@nestjs/common';
import type { PaginationQuery } from '../pagination';
import { Injectable } from '@nestjs/common';

import { ERROR_CODES } from '../error-codes';
import { HttpError } from '../http-error';
import { PAGINATION_DEFAULTS } from '../pagination';

type RawPaginationQuery = Record<string, unknown>;
type NormalizedPaginationQuery = {
	page: number;
	limit: number;
};

function parseQueryNumber(value: unknown): number | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (typeof value === 'number') {
		return value;
	}

	if (typeof value === 'string') {
		const normalized = value.trim();
		if (normalized.length === 0) {
			return Number.NaN;
		}

		return Number(normalized);
	}

	return Number.NaN;
}

function normalizePaginationQuery(query: RawPaginationQuery): NormalizedPaginationQuery {
	return {
		page: parseQueryNumber(query.page) ?? PAGINATION_DEFAULTS.page,
		limit: parseQueryNumber(query.limit) ?? PAGINATION_DEFAULTS.limit,
	};
}

function validatePaginationQuery(query: NormalizedPaginationQuery): PaginationQuery {
	const issues: Array<{ path: string; message: string; value: unknown }> = [];
	const { page, limit } = query;

	if (!Number.isInteger(page) || page < 1) {
		issues.push({
			path: 'page',
			message: 'page must be an integer greater than or equal to 1',
			value: page,
		});
	}

	if (!Number.isInteger(limit) || limit < 1 || limit > PAGINATION_DEFAULTS.maxLimit) {
		issues.push({
			path: 'limit',
			message: `limit must be an integer between 1 and ${PAGINATION_DEFAULTS.maxLimit}`,
			value: limit,
		});
	}

	if (issues.length > 0) {
		throw new HttpError(400, ERROR_CODES.VALIDATION_ERROR, 'Request validation failed', {
			issues,
		});
	}

	return query as PaginationQuery;
}

@Injectable()
export class PaginationQueryPipe implements PipeTransform<RawPaginationQuery, PaginationQuery> {
	public transform(query: RawPaginationQuery): PaginationQuery {
		const normalized = normalizePaginationQuery(query);

		return validatePaginationQuery(normalized);
	}
}
