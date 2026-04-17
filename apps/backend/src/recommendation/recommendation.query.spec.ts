import { ERROR_CODES } from '../http/error-codes';
import { HttpError } from '../http/http-error';

import { parseRecommendationLimit } from './recommendation.query';

describe('recommendation query parsing', () => {
	it('uses 4 as the default recommendation limit', () => {
		expect(parseRecommendationLimit(undefined)).toBe(4);
	});

	it('accepts explicit limits between 1 and 4', () => {
		expect(parseRecommendationLimit('1')).toBe(1);
		expect(parseRecommendationLimit('4')).toBe(4);
	});

	it('rejects limits outside the supported range', () => {
		try {
			parseRecommendationLimit('5');
			throw new Error('Expected parseRecommendationLimit to throw');
		} catch (error) {
			expect(error).toBeInstanceOf(HttpError);
			expect(error).toMatchObject({
				statusCode: 400,
				code: ERROR_CODES.VALIDATION_ERROR,
			});
		}
	});
});
