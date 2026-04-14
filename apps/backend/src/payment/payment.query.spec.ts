import { ERROR_CODES } from '../http/error-codes';
import { HttpError } from '../http/http-error';

import { parseFailureCode, parseOutcome, parseRequestKey } from './payment.query';

describe('payment query parsing', () => {
	it('accepts non-empty request keys', () => {
		expect(parseRequestKey('  req-123  ')).toBe('req-123');
	});

	it('rejects oversized or invalid request keys', () => {
		expect(() => parseRequestKey('bad key')).toThrow(HttpError);
		expect(() => parseRequestKey('x'.repeat(65))).toThrow(HttpError);
	});

	it('accepts success and fail outcomes', () => {
		expect(parseOutcome('success')).toBe('success');
		expect(parseOutcome('fail')).toBe('fail');
	});

	it('requires failureCode when outcome=fail', () => {
		try {
			parseFailureCode('fail', undefined);
			throw new Error('Expected parseFailureCode to throw');
		} catch (error) {
			expect(error).toBeInstanceOf(HttpError);
			expect(error).toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });
		}
	});

	it('rejects invalid failure codes', () => {
		expect(() => parseFailureCode('fail', 'card declined')).toThrow(HttpError);
		expect(() => parseFailureCode('fail', 'X'.repeat(65))).toThrow(HttpError);
	});
});
