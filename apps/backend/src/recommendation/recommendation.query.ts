import { ERROR_CODES } from '../http/error-codes';
import { HttpError } from '../http/http-error';

import { RECOMMENDATION_LIMIT_DEFAULT, RECOMMENDATION_LIMIT_MAX } from './recommendation.types';

export function parseRecommendationLimit(value: unknown): number {
	if (value === undefined) {
		return RECOMMENDATION_LIMIT_DEFAULT;
	}

	if (typeof value !== 'string') {
		throw new HttpError(400, ERROR_CODES.VALIDATION_ERROR, 'Request validation failed', {
			issues: [
				{
					path: 'limit',
					message: `limit must be an integer between 1 and ${RECOMMENDATION_LIMIT_MAX}`,
					value,
				},
			],
		});
	}

	const normalized = value.trim();
	const parsed = Number(normalized);

	if (!Number.isInteger(parsed) || parsed < 1 || parsed > RECOMMENDATION_LIMIT_MAX) {
		throw new HttpError(400, ERROR_CODES.VALIDATION_ERROR, 'Request validation failed', {
			issues: [
				{
					path: 'limit',
					message: `limit must be an integer between 1 and ${RECOMMENDATION_LIMIT_MAX}`,
					value,
				},
			],
		});
	}

	return parsed;
}
