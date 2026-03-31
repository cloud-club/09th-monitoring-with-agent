import { BadRequestError } from '../http/http-error';

import { DEFAULT_CATALOG_SORT, parseCatalogSort } from './catalog.query';

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
		expect(() => parseCatalogSort('oldest')).toThrow(BadRequestError);
	});
});
