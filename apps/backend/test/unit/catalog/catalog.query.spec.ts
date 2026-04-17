import { ERROR_CODES } from '../../../src/http/error-codes';
import { HttpError } from '../../../src/http/http-error';

import { DEFAULT_CATALOG_SORT, parseCatalogSort } from '../../../src/catalog/catalog.query';

describe('catalog query parsing', () => {
	it('uses newest sorting by default', () => {
		expect(parseCatalogSort(undefined)).toBe(DEFAULT_CATALOG_SORT);
	});

	it('accepts supported sorting values', () => {
		expect(parseCatalogSort('newest')).toBe('newest');
		expect(parseCatalogSort('price_asc')).toBe('price_asc');
		expect(parseCatalogSort('price_desc')).toBe('price_desc');
	});

	it('rejects unsupported sorting values', () => {
		try {
			parseCatalogSort('oldest');
			throw new Error('Expected parseCatalogSort to throw for unsupported sorting value');
		} catch (error) {
			expect(error).toBeInstanceOf(HttpError);

			if (error instanceof HttpError) {
				expect(error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
			}
		}
	});
});
