import { ERROR_CODES } from '../http/error-codes';
import { HttpError } from '../http/http-error';

export function parseRequiredUuidLike(value: unknown, path: 'cartId' | 'addressId'): string {
	if (typeof value !== 'string') {
		throw new HttpError(400, ERROR_CODES.VALIDATION_ERROR, 'Request validation failed', {
			issues: [
				{
					path,
					message: `${path} must be a non-empty string`,
					value,
				},
			],
		});
	}

	const normalized = value.trim();
	if (normalized.length === 0) {
		throw new HttpError(400, ERROR_CODES.VALIDATION_ERROR, 'Request validation failed', {
			issues: [
				{
					path,
					message: `${path} must be a non-empty string`,
					value,
				},
			],
		});
	}

	return normalized;
}
