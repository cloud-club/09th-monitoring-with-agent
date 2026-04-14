import { ERROR_CODES } from '../http/error-codes';
import { HttpError } from '../http/http-error';

export type PaymentOutcome = 'success' | 'fail';

const REQUEST_KEY_PATTERN = /^[A-Za-z0-9:_-]{1,64}$/;
const FAILURE_CODE_PATTERN = /^[A-Z0-9_:-]{1,64}$/;

function createValidationError(path: string, message: string, value: unknown): HttpError {
	return new HttpError(400, ERROR_CODES.VALIDATION_ERROR, 'Request validation failed', {
		issues: [{ path, message, value }],
	});
}

export function parseRequestKey(value: unknown): string {
	if (typeof value !== 'string') {
		throw createValidationError('requestKey', 'requestKey must match ^[A-Za-z0-9:_-]{1,64}$', value);
	}

	const normalized = value.trim();
	if (!REQUEST_KEY_PATTERN.test(normalized)) {
		throw createValidationError('requestKey', 'requestKey must match ^[A-Za-z0-9:_-]{1,64}$', value);
	}

	return normalized;
}

export function parseOutcome(value: unknown): PaymentOutcome {
	if (value === 'success' || value === 'fail') {
		return value;
	}

	throw createValidationError('outcome', 'outcome must be one of success or fail', value);
}

export function parseFailureCode(outcome: PaymentOutcome, value: unknown): string | null {
	if (outcome === 'success') {
		return null;
	}

	if (typeof value !== 'string') {
		throw createValidationError('failureCode', 'failureCode must match ^[A-Z0-9_:-]{1,64}$ when outcome=fail', value);
	}

	const normalized = value.trim();
	if (!FAILURE_CODE_PATTERN.test(normalized)) {
		throw createValidationError('failureCode', 'failureCode must match ^[A-Z0-9_:-]{1,64}$ when outcome=fail', value);
	}

	return normalized;
}
