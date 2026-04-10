import { ERROR_CODES } from '../http/error-codes';
import { HttpError } from '../http/http-error';

type SearchValidationIssue = {
	path: 'q';
	message: string;
	value: unknown;
};

type SearchValidationSuccess = {
	readonly ok: true;
	readonly value: string;
};

type SearchValidationFailure = {
	readonly ok: false;
	readonly issues: readonly SearchValidationIssue[];
};

export type SearchValidationResult = SearchValidationSuccess | SearchValidationFailure;

export function validateSearchTerm(value: unknown): SearchValidationResult {
	if (typeof value !== 'string') {
		return {
			ok: false,
			issues: [
				{
					path: 'q',
					message: 'q must be a string with at least 2 characters',
					value,
				},
			],
		};
	}

	const normalized = value.trim();

	if (normalized.length < 2) {
		return {
			ok: false,
			issues: [
				{
					path: 'q',
					message: 'q must be a string with at least 2 characters',
					value,
				},
			],
		};
	}

	return {
		ok: true,
		value: normalized,
	};
}

export function parseSearchTerm(value: unknown): string {
	const validation = validateSearchTerm(value);

	if (validation.ok) {
		return validation.value;
	}

	throw new HttpError(400, ERROR_CODES.VALIDATION_ERROR, 'Request validation failed', {
		issues: validation.issues,
	});
}
