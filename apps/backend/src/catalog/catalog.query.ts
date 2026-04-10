import { ERROR_CODES } from '../http/error-codes';
import { HttpError } from '../http/http-error';

import { CATALOG_SORT_VALUES } from './catalog.types';
import type { CatalogSort } from './catalog.types';

export const DEFAULT_CATALOG_SORT: CatalogSort = 'newest';

function isCatalogSort(value: string): value is CatalogSort {
	return CATALOG_SORT_VALUES.includes(value as CatalogSort);
}

export function parseCatalogSort(value: unknown): CatalogSort {
	if (value === undefined) {
		return DEFAULT_CATALOG_SORT;
	}

	if (typeof value !== 'string') {
		throw new HttpError(400, ERROR_CODES.VALIDATION_ERROR, 'Request validation failed', {
			issues: [{ path: 'sort', message: 'sort must be one of newest, price_asc, price_desc', value }],
		});
	}

	const normalized = value.trim();
	if (isCatalogSort(normalized)) {
		return normalized;
	}

	throw new HttpError(400, ERROR_CODES.VALIDATION_ERROR, 'Request validation failed', {
		issues: [{ path: 'sort', message: 'sort must be one of newest, price_asc, price_desc', value }],
	});
}
