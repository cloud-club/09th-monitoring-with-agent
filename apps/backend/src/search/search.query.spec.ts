import { ERROR_CODES } from '../http/error-codes';
import { HttpError } from '../http/http-error';

import { parseSearchTerm, validateSearchTerm } from './search.query';

describe('search query parsing', () => {
	it('trims a valid query string', () => {
		expect(parseSearchTerm('  mug  ')).toBe('mug');
	});

	it('rejects one-character queries', () => {
		try {
			parseSearchTerm('a');
			throw new Error('Expected parseSearchTerm to throw');
		} catch (error) {
			expect(error).toBeInstanceOf(HttpError);
			expect(error).toMatchObject({
				statusCode: 400,
				code: ERROR_CODES.VALIDATION_ERROR,
				message: 'Request validation failed',
			});
		}
	});

	it('rejects empty trimmed queries', () => {
		expect(validateSearchTerm('   ')).toEqual({
			ok: false,
			issues: [
				{
					path: 'q',
					message: 'q must be a string with at least 2 characters',
					value: '   ',
				},
			],
		});
	});
});
