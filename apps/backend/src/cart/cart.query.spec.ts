import { ERROR_CODES } from '../http/error-codes';
import { HttpError } from '../http/http-error';

import { parseCartQuantity, parseCartVariantId, parseRequiredCartQuantity } from './cart.query';

describe('cart quantity parsing', () => {
	it('uses the default quantity when omitted', () => {
		expect(parseCartQuantity(undefined)).toBe(1);
	});

	it('accepts quantities inside the supported range', () => {
		expect(parseCartQuantity('1')).toBe(1);
		expect(parseCartQuantity('20')).toBe(20);
	});

	it('rejects quantities outside the supported range', () => {
		try {
			parseCartQuantity('21');
			throw new Error('Expected parseCartQuantity to throw');
		} catch (error) {
			expect(error).toBeInstanceOf(HttpError);
			expect(error).toMatchObject({
				statusCode: 400,
				code: ERROR_CODES.VALIDATION_ERROR,
			});
		}
	});

	it('requires quantity for patch-style updates', () => {
		try {
			parseRequiredCartQuantity(undefined);
			throw new Error('Expected parseRequiredCartQuantity to throw');
		} catch (error) {
			expect(error).toBeInstanceOf(HttpError);
			expect(error).toMatchObject({
				statusCode: 400,
				code: ERROR_CODES.VALIDATION_ERROR,
			});
		}
	});

	it('requires a non-empty variant id', () => {
		expect(parseCartVariantId('  var-id  ')).toBe('var-id');

		try {
			parseCartVariantId(undefined);
			throw new Error('Expected parseCartVariantId to throw');
		} catch (error) {
			expect(error).toBeInstanceOf(HttpError);
			expect(error).toMatchObject({
				statusCode: 400,
				code: ERROR_CODES.VALIDATION_ERROR,
			});
		}
	});
});
