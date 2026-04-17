import { ERROR_CODES } from '../http/error-codes';
import { HttpError } from '../http/http-error';

import { parseRequiredUuidLike } from './order.query';

describe('order query parsing', () => {
	it('accepts non-empty ids', () => {
		expect(parseRequiredUuidLike('  abc  ', 'cartId')).toBe('abc');
	});

	it('rejects empty ids', () => {
		try {
			parseRequiredUuidLike('', 'addressId');
			throw new Error('Expected parseRequiredUuidLike to throw');
		} catch (error) {
			expect(error).toBeInstanceOf(HttpError);
			expect(error).toMatchObject({
				statusCode: 400,
				code: ERROR_CODES.VALIDATION_ERROR,
			});
		}
	});
});
